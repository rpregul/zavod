-- Exact hourly observations start on deployment; past hours are not fabricated.
create table if not exists nz_metrics.visit_hours(
 visitor_id uuid not null references nz_metrics.visitors(id) on delete cascade,
 hour timestamptz not null, primary key(visitor_id,hour)
);
alter table nz_metrics.visit_hours enable row level security;
revoke all on nz_metrics.visit_hours from public,anon,authenticated;
create or replace function nz_metrics.capture_visit_hour() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into nz_metrics.visit_hours(visitor_id,hour) values(new.id,date_trunc('hour',now())) on conflict do nothing;
 return new;
end $$;
revoke all on function nz_metrics.capture_visit_hour() from public,anon,authenticated;
drop trigger if exists capture_visit_hour on nz_metrics.visitors;
create trigger capture_visit_hour after insert or update of last_seen on nz_metrics.visitors
for each row execute function nz_metrics.capture_visit_hour();
create table if not exists nz_metrics.campaign_snapshots(
 name text primary key, measured_at timestamptz not null default now(), baseline jsonb not null,
 hourly_started timestamptz not null default now()
);
alter table nz_metrics.campaign_snapshots enable row level security;
revoke all on nz_metrics.campaign_snapshots from public,anon,authenticated;
create or replace function nz_metrics.traffic_report(p_token text,p_day date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uk text; chosen date:=coalesce(p_day,(now() at time zone 'Europe/Moscow')::date);today date:=(now() at time zone 'Europe/Moscow')::date; result jsonb;
begin
 select user_key into uk from public.nz_sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
 if uk is distinct from 'рома' then raise exception 'forbidden';end if;
 if chosen<today-13 or chosen>today then raise exception 'invalid_day';end if;
 with valid as materialized (
 select v.*,coalesce(v.user_key,'anonymous:'||v.id::text) identity,min(v.first_seen) over(partition by coalesce(v.user_key,'anonymous:'||v.id::text)) identity_first_seen from nz_metrics.visitors v
 where not v.excluded and (v.user_key is null or exists(select 1 from public.nz_users u where u.key=v.user_key and u.key<>'рома' and left(u.name,5)<>'__qa_' and left(u.name,7)<>'__test_'))
 ), days as (
 select d::date as day,count(distinct v.identity) visitors,count(distinct v.identity) filter(where (v.identity_first_seen at time zone 'Europe/Moscow')::date=d::date) new_visitors
 from generate_series(today-13,today,interval '1 day') d left join nz_metrics.visits a on a.day=d::date left join valid v on v.id=a.visitor_id group by 1
 ), hours as (
 select h,count(distinct v.identity) visitors from generate_series(0,23) h
 left join nz_metrics.visit_hours a on (a.hour at time zone 'Europe/Moscow')::date=chosen and extract(hour from a.hour at time zone 'Europe/Moscow')=h
 left join valid v on v.id=a.visitor_id group by 1
 )
 select jsonb_build_object('measured_at',now(),'today',today,'day',chosen,'timezone','Europe/Moscow',
 'daily',(select jsonb_agg(days order by day) from days),
 'hourly',(select jsonb_agg(hours order by h) from hours),
 'campaign',(select jsonb_build_object('measured_at',measured_at,'hourly_started',hourly_started,'baseline',baseline) from nz_metrics.campaign_snapshots where name='black-friday-2026'),
 'tracking_started',(select min(first_seen) from valid),'today_partial',true) into result;
 return result;
end $$;
revoke all on function nz_metrics.traffic_report(text,date) from public;
grant execute on function nz_metrics.traffic_report(text,date) to anon,authenticated;
create or replace function public.nz_traffic_report(p_token text,p_day date default null)
returns jsonb language sql set search_path='' as $$select nz_metrics.traffic_report(p_token,p_day)$$;
revoke all on function public.nz_traffic_report(text,date) from public;
grant execute on function public.nz_traffic_report(text,date) to anon,authenticated;
