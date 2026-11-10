-- Only explicit event types and identifiers are accepted; never form values or URLs.
create table nz_metrics.events (
 id uuid primary key,
 visitor_id uuid not null references nz_metrics.visitors(id) on delete cascade,
 session_id uuid not null,
 user_key text references public.nz_users(key) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 event text not null,
 target text not null default '',
 screen text not null default '',
 ms integer not null default 0,
 value integer not null default 0,
 x integer,
 y integer
);
create index nz_events_session on nz_metrics.events(session_id,created_at);
create index nz_events_created on nz_metrics.events(created_at);
alter table nz_metrics.events enable row level security;
revoke all on nz_metrics.events from public,anon,authenticated;
create function nz_metrics.behavior_events(p_visitor uuid,p_session uuid,p_token text,p_events jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare uk text; nm text; e jsonb;
begin
 if p_visitor is null or p_session is null or jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>30 then raise exception 'invalid_batch';end if;
 if coalesce(p_token,'')<>'' then
  select s.user_key,u.name into uk,nm from public.nz_sessions s join public.nz_users u on u.key=s.user_key where s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and s.expires_at>now();
  if uk is null then raise exception 'unauthorized';end if;
 end if;
 if uk='рома' or left(nm,5)='__qa_' or left(nm,7)='__test_' then return;end if;
 perform nz_metrics.record_visit(p_visitor,'direct',p_token);
 if exists(select 1 from nz_metrics.visitors where id=p_visitor and excluded) then return;end if;
 -- Bound storage per visitor/day. Events older than 90 days expire lazily.
 if (select count(*) from nz_metrics.events where visitor_id=p_visitor and created_at>now()-interval '1 day')>6000 then return;end if;
 delete from nz_metrics.events where created_at<now()-interval '90 days';
 for e in select * from jsonb_array_elements(p_events) loop
  if e->>'event' not in ('screen','click','impression','submit','scroll','active','request_start','request_ok','request_error','error','connection','visibility','leave','session','load','exercise','commerce') then raise exception 'invalid_event';end if;
  if coalesce(e->>'target','') !~ '^[a-zA-Z0-9_-]{0,48}$' or coalesce(e->>'screen','') !~ '^[a-zA-Z0-9_-]{0,48}$' then raise exception 'invalid_identifier';end if;
  insert into nz_metrics.events(id,visitor_id,session_id,user_key,created_at,event,target,screen,ms,value,x,y)
  values((e->>'id')::uuid,p_visitor,p_session,uk,greatest(now()-interval '1 day',least(clock_timestamp(),(e->>'at')::timestamptz)),e->>'event',coalesce(e->>'target',''),coalesce(e->>'screen',''),greatest(0,least(600000,coalesce((e->>'ms')::integer,0))),greatest(0,least(100000,coalesce((e->>'value')::integer,0))),case when e->>'x' is null then null else greatest(0,least(1000,(e->>'x')::integer)) end,case when e->>'y' is null then null else greatest(0,least(1000,(e->>'y')::integer)) end) on conflict(id) do nothing;
 end loop;
end $$;
revoke all on function nz_metrics.behavior_events(uuid,uuid,text,jsonb) from public;
grant execute on function nz_metrics.behavior_events(uuid,uuid,text,jsonb) to anon,authenticated;
create function public.nz_behavior_events(p_visitor uuid,p_session uuid,p_token text,p_events jsonb) returns void language sql security invoker set search_path='' as $$select nz_metrics.behavior_events(p_visitor,p_session,p_token,p_events)$$;
revoke all on function public.nz_behavior_events(uuid,uuid,text,jsonb) from public;
grant execute on function public.nz_behavior_events(uuid,uuid,text,jsonb) to anon,authenticated;
create function nz_metrics.behavior_report(p_token text,p_days integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uk text; result jsonb;
begin
 select s.user_key into uk from public.nz_sessions s where s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and s.expires_at>now();
 if uk is distinct from 'рома' then raise exception 'forbidden';end if;
 if p_days not between 1 and 90 then raise exception 'invalid_period';end if;
 with e as materialized (
 select x.* from nz_metrics.events x join nz_metrics.visitors v on v.id=x.visitor_id where not v.excluded and x.created_at>=now()-make_interval(days=>p_days)
 ), controls as (
 select target,count(*) filter(where event='impression') as views,count(*) filter(where event='click') as clicks from e where event in ('impression','click') group by target
 ), requests as (
 select target,count(*) as count,round(percentile_cont(.5) within group(order by ms)) as median_ms,round(percentile_cont(.95) within group(order by ms)) as p95_ms,count(*) filter(where event='request_error') as errors from e where event in ('request_ok','request_error') group by target
 ), commerce as (
 select target,count(*) as count,count(distinct coalesce(user_key,visitor_id::text)) as visitors from e where event='commerce' group by target
 ), sessions as (
 select session_id,min(created_at) as started,max(created_at) as ended,max(user_key) as user_key,bool_or(event='session' and value=1) as mobile from e group by session_id order by max(created_at) desc limit 40
 ), journeys as (
 select s.started,s.mobile,u.name,(select coalesce(jsonb_agg(row order by row.created_at),'[]'::jsonb) from (select created_at,event,target,screen,ms,value,x,y from e where e.session_id=s.session_id order by created_at desc limit 100) row) as events from sessions s left join public.nz_users u on u.key=s.user_key
 ) select jsonb_build_object(
 'sessions',(select count(distinct session_id) from e),
 'active_ms',(select coalesce(sum(ms),0) from e where event='active'),
 'errors',(select count(*) from e where event='request_error'),
 'commerce',(select coalesce(jsonb_agg(commerce order by count desc),'[]'::jsonb) from commerce),
 'controls',(select coalesce(jsonb_agg(controls order by views desc),'[]'::jsonb) from controls),
 'requests',(select coalesce(jsonb_agg(requests order by count desc),'[]'::jsonb) from requests),
 'journeys',(select coalesce(jsonb_agg(journeys order by started desc),'[]'::jsonb) from journeys)
 ) into result;
 return result;
end $$;
revoke all on function nz_metrics.behavior_report(text,integer) from public;
grant execute on function nz_metrics.behavior_report(text,integer) to anon,authenticated;
create function public.nz_behavior_report(p_token text,p_days integer default 30) returns jsonb language sql security invoker set search_path='' as $$select nz_metrics.behavior_report(p_token,p_days)$$;
revoke all on function public.nz_behavior_report(text,integer) from public;
grant execute on function public.nz_behavior_report(text,integer) to anon,authenticated;
