-- Minimal first-party counter. Raw rows are private; only the owner can read reports.
create schema if not exists nz_metrics;
revoke all on schema nz_metrics from public;
grant usage on schema nz_metrics to anon,authenticated;
create table nz_metrics.visitors (
 id uuid primary key,
 first_seen timestamptz not null default now(),
 last_seen timestamptz not null default now(),
 source text not null default 'direct',
 user_key text references public.nz_users(key) on delete set null,
 excluded boolean not null default false
);
create table nz_metrics.visits (
 visitor_id uuid not null references nz_metrics.visitors(id) on delete cascade,
 day date not null default (now() at time zone 'Europe/Moscow')::date,
 primary key(visitor_id,day)
);
alter table nz_metrics.visitors enable row level security;
alter table nz_metrics.visits enable row level security;
revoke all on nz_metrics.visitors,nz_metrics.visits from public,anon,authenticated;
create index nz_visitors_user on nz_metrics.visitors(user_key) where user_key is not null;
alter table public.nz_payments add column is_test boolean not null default true;
-- The payment provider's authenticated response is already validated by the billing worker.
-- Missing test metadata is treated as unverified and excluded from revenue.
do $$ declare def text; begin
 select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='nz_billing_api';
 if def is null or position('set state=''succeeded'',applied_at' in def)=0 then raise exception 'billing settlement signature changed';end if;
 def:=replace(def,'set state=''succeeded'',applied_at','set state=''succeeded'',is_test=coalesce((obj->>''test'')::boolean,true),applied_at');
 execute def;
end $$;
create function nz_metrics.record_visit(p_visitor uuid,p_source text,p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare uk text; nm text;
begin
 if p_visitor is null then raise exception 'invalid_visitor';end if;
 if coalesce(p_token,'')<>'' then
  select s.user_key,u.name into uk,nm from public.nz_sessions s join public.nz_users u on u.key=s.user_key where s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and s.expires_at>now();
  if uk is null then raise exception 'unauthorized';end if;
 end if;
 insert into nz_metrics.visitors(id,source,user_key,excluded) values(p_visitor,case when p_source ~ '^[a-zA-Z0-9._-]{1,80}$' then p_source else 'direct' end,uk,coalesce(uk='рома' or left(nm,5)='__qa_' or left(nm,7)='__test_',false))
 on conflict(id) do update set last_seen=now(),user_key=coalesce(excluded.user_key,nz_metrics.visitors.user_key),excluded=nz_metrics.visitors.excluded or excluded.excluded;
 insert into nz_metrics.visits(visitor_id) values(p_visitor) on conflict do nothing;
end $$;
revoke all on function nz_metrics.record_visit(uuid,text,text) from public;
grant execute on function nz_metrics.record_visit(uuid,text,text) to anon,authenticated;
create function public.nz_record_visit(p_visitor uuid,p_source text default 'direct',p_token text default '') returns void language sql security invoker set search_path='' as $$select nz_metrics.record_visit(p_visitor,p_source,p_token)$$;
revoke all on function public.nz_record_visit(uuid,text,text) from public;
grant execute on function public.nz_record_visit(uuid,text,text) to anon,authenticated;
create function nz_metrics.funnel_report(p_token text,p_days integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uk text; result jsonb; since_ts timestamptz;
begin
 select s.user_key into uk from public.nz_sessions s where s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and s.expires_at>now();
 if uk is distinct from 'рома' then raise exception 'forbidden';end if;
 if p_days not between 1 and 365 then raise exception 'invalid_period';end if;
 since_ts:=now()-make_interval(days=>p_days);
 with people as (
  select coalesce(v.user_key,'anonymous:'||v.id::text) as identity,min(v.first_seen) as first_seen,min(u.created_at) as registered_at,min(t.started_at) as trial_started,min(t.completed_at) as trial_completed,min(p.applied_at) as purchased
  from nz_metrics.visitors v left join public.nz_users u on u.key=v.user_key left join public.nz_trials t on t.user_key=v.user_key
  left join public.nz_payments p on p.user_key=v.user_key and p.state='succeeded' and not p.is_test and p.kind='checkout'
  where not v.excluded and v.first_seen>=since_ts group by coalesce(v.user_key,'anonymous:'||v.id::text)
 ) select jsonb_build_object('visitors',count(*),'registered',count(*) filter(where registered_at>=first_seen-interval '1 minute'),'trial_started',count(*) filter(where registered_at>=first_seen-interval '1 minute' and trial_started>=registered_at),'trial_completed',count(*) filter(where registered_at>=first_seen-interval '1 minute' and trial_completed>=trial_started),'buyers',count(*) filter(where registered_at>=first_seen-interval '1 minute' and trial_completed is not null and purchased>=trial_completed)) into result from people;
 return jsonb_build_object('measured_at',now(),'days',p_days,'tracking_started',(select min(first_seen) from nz_metrics.visitors where not excluded),'funnel',result,
 'totals',(select jsonb_build_object('registrations',count(*),'trial_started',count(t.user_key),'trial_completed',count(t.completed_at),'buyers',(select count(distinct p.user_key) from public.nz_payments p join public.nz_users a on a.key=p.user_key where p.state='succeeded' and not p.is_test and left(a.name,5)<>'__qa_' and left(a.name,7)<>'__test_')) from public.nz_users u left join public.nz_trials t on t.user_key=u.key where left(u.name,5)<>'__qa_' and left(u.name,7)<>'__test_'),
 'trials',(select coalesce(jsonb_agg(jsonb_build_object('name',u.name,'started_at',t.started_at,'completed_at',t.completed_at,'exercises',t.next_index) order by t.started_at),'[]'::jsonb) from public.nz_trials t join public.nz_users u on u.key=t.user_key where left(u.name,5)<>'__qa_' and left(u.name,7)<>'__test_'));
end $$;
revoke all on function nz_metrics.funnel_report(text,integer) from public;
grant execute on function nz_metrics.funnel_report(text,integer) to anon,authenticated;
create function public.nz_funnel_report(p_token text,p_days integer default 30) returns jsonb language sql security invoker set search_path='' as $$select nz_metrics.funnel_report(p_token,p_days)$$;
revoke all on function public.nz_funnel_report(text,integer) from public;
grant execute on function public.nz_funnel_report(text,integer) to anon,authenticated;
