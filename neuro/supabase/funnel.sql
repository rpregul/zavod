create or replace function nz_metrics.funnel_report(p_token text, p_days integer)
returns jsonb language plpgsql security definer set search_path='' as $$
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
    from nz_metrics.visitors v
    where not v.excluded and (v.user_key is null or v.user_key in (select key from valid_users))
    group by 1
  ), people as materialized (
    select i.*, u.created_at profile_at,
      coalesce(u.key !~ '^g_[0-9a-f]{32}$',false) named_profile,
      t.started_at, t.completed_at,
      (select min(p.applied_at) from public.nz_payments p
       where p.user_key=i.user_key and p.state='succeeded' and not p.is_test and p.kind='checkout') paid_at
    from identities i left join valid_users u on u.key=i.user_key
    left join public.nz_trials t on t.user_key=i.user_key
    where i.first_seen>=cohort_start
  ), events as materialized (
    select coalesce(e.user_key,v.user_key,'anonymous:'||e.visitor_id::text) identity,
      e.event,e.target,e.created_at
    from nz_metrics.events e join nz_metrics.visitors v on v.id=e.visitor_id
    where not v.excluded and e.created_at>=cohort_start
  ), stages as (
    select p.*,
      exists(select 1 from events e where e.identity=p.identity and e.event='screen' and e.target='summary' and e.created_at>=p.completed_at) summary_seen,
      exists(select 1 from events e where e.identity=p.identity and e.event='impression' and e.target in ('offer','plan_individual','plan_family') and e.created_at>=p.completed_at) offer_seen,
      exists(select 1 from events e where e.identity=p.identity and e.event='click' and e.target in ('plan_individual','plan_family') and e.created_at>=p.completed_at) plan_selected,
      exists(select 1 from events e where e.identity=p.identity and e.event='commerce' and e.target in ('checkout_submit_individual','checkout_submit_family') and e.created_at>=p.completed_at) checkout_submitted
    from people p
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
    'tracking_started',(select min(first_seen) from nz_metrics.visitors where not excluded),
    'funnel',report,
    'totals',(select jsonb_build_object(
      'registrations',count(*) filter(where u.key !~ '^g_[0-9a-f]{32}$'),
      'guests',count(*) filter(where u.key ~ '^g_[0-9a-f]{32}$'),
      'trial_started',count(t.user_key),'trial_completed',count(t.completed_at),
      'buyers',(select count(distinct p.user_key) from public.nz_payments p join public.nz_users a on a.key=p.user_key
        where p.state='succeeded' and not p.is_test and p.kind='checkout' and a.key<>'рома' and left(a.name,5)<>'__qa_' and left(a.name,7)<>'__test_')
    ) from public.nz_users u left join public.nz_trials t on t.user_key=u.key
       where u.key<>'рома' and left(u.name,5)<>'__qa_' and left(u.name,7)<>'__test_'),
    'trials',(select coalesce(jsonb_agg(jsonb_build_object(
      'name',case when u.key ~ '^g_[0-9a-f]{32}$' then 'Гость · '||left(t.id::text,6) else u.name end,
      'started_at',t.started_at,'completed_at',t.completed_at,'exercises',t.next_index
    ) order by t.started_at),'[]'::jsonb)
    from public.nz_trials t join public.nz_users u on u.key=t.user_key
    where u.key<>'рома' and left(u.name,5)<>'__qa_' and left(u.name,7)<>'__test_')
  );
end $$;
