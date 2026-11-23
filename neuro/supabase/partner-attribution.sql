create table nz_metrics.partner_touches(visitor_id uuid not null,session_id uuid not null,partner text not null check(partner in ('m','evgenia')),seen_at timestamptz not null,primary key(visitor_id,session_id));
create index on nz_metrics.partner_touches(visitor_id,seen_at);
alter table nz_metrics.partner_touches enable row level security;
revoke all on nz_metrics.partner_touches from public,anon,authenticated;
create function nz_metrics.capture_partner() returns trigger language plpgsql set search_path='' as $$
begin
insert into nz_metrics.partner_touches values(new.visitor_id,new.session_id,case new.target when 'partner_m' then 'm' else 'evgenia' end,new.created_at) on conflict do nothing;
return new;
end $$;
create trigger partner_landing after insert on nz_metrics.events for each row when (new.screen='landing' and new.event='session' and new.target in ('partner_m','partner_evgenia')) execute function nz_metrics.capture_partner();
alter table public.nz_payments add column first_partner text, add column last_partner text;
create function nz_metrics.attribute_sale() returns trigger language plpgsql security definer set search_path='' as $$
begin
if new.kind='checkout' and new.state='succeeded' and not new.is_test then
 select (array_agg(t.partner order by t.seen_at,t.session_id))[1],(array_agg(t.partner order by t.seen_at desc,t.session_id desc))[1] into new.first_partner,new.last_partner
 from nz_metrics.partner_touches t join nz_metrics.visitors v on v.id=t.visitor_id where v.user_key=new.user_key and not v.excluded and t.seen_at<=coalesce(new.applied_at,now()) and not exists(select 1 from nz_metrics.test_visits x where x.visitor_id=t.visitor_id and x.session_id=t.session_id);
end if;
return new;
end $$;
revoke all on function nz_metrics.attribute_sale(),nz_metrics.capture_partner() from public,anon,authenticated;
create trigger partner_sale_insert before insert on public.nz_payments for each row execute function nz_metrics.attribute_sale();
create trigger partner_sale_update before update of state on public.nz_payments for each row when(old.state is distinct from new.state and new.state='succeeded') execute function nz_metrics.attribute_sale();
CREATE OR REPLACE FUNCTION nz_metrics.funnel_report(p_token text, p_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner_key text;
  report jsonb;
  cohort_start timestamptz;
  guest_release constant timestamptz := '2026-11-11 09:40:00+00';
begin
  select user_key into owner_key from public.nz_sessions
  where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
  if owner_key is distinct from 'рома' then raise exception 'forbidden'; end if;
  if p_days is null or p_days not between 1 and 365 then raise exception 'invalid_period'; end if;
  cohort_start := greatest(now()-make_interval(days=>p_days), guest_release);

  with valid_users as materialized (
    select * from public.nz_users
    where key<>'рома' and left(name,5)<>'__qa_' and left(name,7)<>'__test_'
  ), identities as materialized (
    select coalesce(v.user_key,'anonymous:'||v.id::text) identity,
      min(v.first_seen) first_seen, max(v.user_key) user_key
    from nz_metrics.report_visitors v
    where not v.excluded and (v.user_key is null or v.user_key in (select key from valid_users))
    group by 1
  ), people as materialized (
    select i.*, u.created_at profile_at,
      coalesce(u.key !~ '^g_[0-9a-f]{32}$',false) named_profile,
      t.started_at, t.completed_at,
      (select min(p.applied_at) from public.nz_payments p
       where p.user_key=i.user_key and p.state='succeeded' and not p.is_test and p.kind='checkout') paid_at
    from identities i left join valid_users u on u.key=i.user_key
    left join nz_metrics.report_trials t on t.user_key=i.user_key
    where i.first_seen>=cohort_start
  ), events as materialized (
    select coalesce(e.user_key,v.user_key,'anonymous:'||e.visitor_id::text) identity,
      max(e.created_at) filter (where e.event='screen' and e.target='summary') summary_at,
      max(e.created_at) filter (where e.event='impression' and e.target in ('offer','plan_individual','plan_family','plan_quarter')) offer_at,
      max(e.created_at) filter (where e.event='click' and e.target in ('plan_individual','plan_family','plan_quarter')) plan_at,
      max(e.created_at) filter (where e.event='commerce' and e.target in ('checkout_submit_individual','checkout_submit_family','checkout_submit_quarter')) checkout_at
    from nz_metrics.report_events e join nz_metrics.report_visitors v on v.id=e.visitor_id
    where not v.excluded and e.created_at>=cohort_start
      and e.event in ('screen','impression','click','commerce')
    group by 1
  ), stages as (
    select p.*, e.summary_at>=p.completed_at summary_seen,
      e.offer_at>=p.completed_at offer_seen, e.plan_at>=p.completed_at plan_selected,
      e.checkout_at>=p.completed_at checkout_submitted
    from people p left join events e on e.identity=p.identity
  )
  select jsonb_build_object(
    'visitors',count(*),
    'registered',count(*) filter(where named_profile and profile_at>=first_seen),
    'trial_started',count(*) filter(where started_at>=first_seen),
    'trial_completed',count(*) filter(where completed_at>=started_at and started_at>=first_seen),
    'summary_seen',count(*) filter(where summary_seen and started_at>=first_seen),
    'offer_seen',count(*) filter(where offer_seen and started_at>=first_seen),
    'plan_selected',count(*) filter(where plan_selected and started_at>=first_seen),
    'checkout_submitted',count(*) filter(where checkout_submitted and started_at>=first_seen),
    'buyers',count(*) filter(where paid_at>=completed_at and started_at>=first_seen),
    'profile_created_after_payment',count(*) filter(where named_profile and profile_at>=paid_at and paid_at>=completed_at and started_at>=first_seen)
  ) into report from stages;

  return jsonb_build_object(
    'version',2,'measured_at',now(),'days',p_days,'cohort_start',cohort_start,
    'tracking_started',(select min(first_seen) from nz_metrics.report_visitors where not excluded),
    'funnel',report,
    'totals',(select jsonb_build_object(
      'registrations',count(*) filter(where u.key !~ '^g_[0-9a-f]{32}$'),
      'guests',count(*) filter(where u.key ~ '^g_[0-9a-f]{32}$'),
      'trial_started',count(t.user_key),'trial_completed',count(t.completed_at),
      'buyers',(select count(distinct p.user_key) from public.nz_payments p join public.nz_users a on a.key=p.user_key
        where p.state='succeeded' and not p.is_test and p.kind='checkout' and a.key<>'рома' and left(a.name,5)<>'__qa_' and left(a.name,7)<>'__test_')
    ) from public.nz_users u left join nz_metrics.report_trials t on t.user_key=u.key
       where u.key<>'рома' and left(u.name,5)<>'__qa_' and left(u.name,7)<>'__test_'),
    'trials','[]'::jsonb
  );
end $function$;

CREATE OR REPLACE FUNCTION public.nz_source_funnel(p_token text, p_days integer, p_partner text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner_key text;
  report jsonb;
  cohort_start timestamptz;
  guest_release constant timestamptz := '2026-11-11 09:40:00+00';
begin
  select user_key into owner_key from public.nz_sessions
  where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
  if owner_key is distinct from 'рома' then raise exception 'forbidden'; end if;
  if p_partner not in ('evgenia','m','unknown') or p_partner is null then raise exception 'invalid_partner'; end if;
  if p_days is null or p_days not between 1 and 365 then raise exception 'invalid_period'; end if;
  cohort_start := greatest(now()-make_interval(days=>p_days), guest_release);

  with valid_users as materialized (
    select * from public.nz_users
    where key<>'рома' and left(name,5)<>'__qa_' and left(name,7)<>'__test_'
  ), identities as materialized (
    select coalesce(v.user_key,'anonymous:'||v.id::text) identity,
      min(v.first_seen) first_seen, max(v.user_key) user_key
    from nz_metrics.report_visitors v
    where not v.excluded and (v.user_key is null or v.user_key in (select key from valid_users))
    group by 1
  ), people as materialized (
    select i.*, u.created_at profile_at,
      coalesce(u.key !~ '^g_[0-9a-f]{32}$',false) named_profile,
      t.started_at, t.completed_at,
      (select min(p.applied_at) from public.nz_payments p
       where p.user_key=i.user_key and p.state='succeeded' and not p.is_test and p.kind='checkout') paid_at
    from identities i left join valid_users u on u.key=i.user_key
    left join nz_metrics.report_trials t on t.user_key=i.user_key
    where i.first_seen>=cohort_start and coalesce((select t.partner from nz_metrics.partner_touches t join nz_metrics.report_visitors v on v.id=t.visitor_id where not v.excluded and coalesce(v.user_key,'anonymous:'||v.id::text)=i.identity and not exists(select 1 from nz_metrics.test_visits x where x.visitor_id=t.visitor_id and x.session_id=t.session_id) order by t.seen_at,t.session_id limit 1),'unknown')=p_partner
  ), events as materialized (
    select coalesce(e.user_key,v.user_key,'anonymous:'||e.visitor_id::text) identity,
      max(e.created_at) filter (where e.event='screen' and e.target='summary') summary_at,
      max(e.created_at) filter (where e.event='impression' and e.target in ('offer','plan_individual','plan_family','plan_quarter')) offer_at,
      max(e.created_at) filter (where e.event='click' and e.target in ('plan_individual','plan_family','plan_quarter')) plan_at,
      max(e.created_at) filter (where e.event='commerce' and e.target in ('checkout_submit_individual','checkout_submit_family','checkout_submit_quarter')) checkout_at
    from nz_metrics.report_events e join nz_metrics.report_visitors v on v.id=e.visitor_id
    where not v.excluded and e.created_at>=cohort_start
      and e.event in ('screen','impression','click','commerce')
    group by 1
  ), stages as (
    select p.*, e.summary_at>=p.completed_at summary_seen,
      e.offer_at>=p.completed_at offer_seen, e.plan_at>=p.completed_at plan_selected,
      e.checkout_at>=p.completed_at checkout_submitted
    from people p left join events e on e.identity=p.identity
  )
  select jsonb_build_object(
    'visitors',count(*),
    'registered',count(*) filter(where named_profile and profile_at>=first_seen),
    'trial_started',count(*) filter(where started_at>=first_seen),
    'trial_completed',count(*) filter(where completed_at>=started_at and started_at>=first_seen),
    'summary_seen',count(*) filter(where summary_seen and started_at>=first_seen),
    'offer_seen',count(*) filter(where offer_seen and started_at>=first_seen),
    'plan_selected',count(*) filter(where plan_selected and started_at>=first_seen),
    'checkout_submitted',count(*) filter(where checkout_submitted and started_at>=first_seen),
    'buyers',count(*) filter(where paid_at>=completed_at and started_at>=first_seen),
    'profile_created_after_payment',count(*) filter(where named_profile and profile_at>=paid_at and paid_at>=completed_at and started_at>=first_seen)
  ) into report from stages;


return jsonb_build_object('funnel',report,'sales',(select jsonb_build_object('buyers',count(distinct p.user_key),'revenue',coalesce(sum(p.amount),0)) from public.nz_payments p where p.state='succeeded' and not p.is_test and p.kind='checkout' and p.applied_at>=cohort_start and coalesce(p.last_partner,'unknown')=p_partner and exists(select 1 from nz_metrics.report_visitors v where v.user_key=p.user_key and not v.excluded)));
end $function$;
revoke all on function public.nz_source_funnel(text,integer,text) from public;
grant execute on function public.nz_source_funnel(text,integer,text) to anon,authenticated;

