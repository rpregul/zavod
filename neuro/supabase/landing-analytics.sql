create table if not exists nz_metrics.landing_baselines (
  name text primary key, label text not null, measured_at timestamptz not null, funnel jsonb not null
);
alter table nz_metrics.landing_baselines enable row level security;
revoke all on nz_metrics.landing_baselines from public, anon, authenticated;

create or replace function nz_metrics.landing_report(p_token text, p_days integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; since_ts timestamptz;
begin
  if not exists (
    select 1 from public.nz_sessions s where s.user_key='рома'
      and s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and s.expires_at>now()
  ) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_days is null or p_days not between 1 and 90 then raise exception 'invalid_period'; end if;
  since_ts := now()-make_interval(days=>p_days);

  with landing as materialized (
    select e.*, coalesce(v.user_key,e.user_key,'browser:'||v.id::text) as person, v.source
    from nz_metrics.events e join nz_metrics.visitors v on v.id=e.visitor_id
    where e.screen='landing' and e.created_at>=since_ts and not v.excluded
  ), entrants as materialized (
    select distinct on(person) person, coalesce(user_key, (select v.user_key from nz_metrics.visitors v where v.id=landing.visitor_id)) as account,
      source, created_at as opened
    from landing where event='screen' and target='landing_open'
    order by person, created_at, id
  ), events as materialized (
    select l.* from landing l join entrants p using(person) where l.created_at>=p.opened
  ), arrivals as materialized (
    select coalesce(v.user_key,e.user_key,'browser:'||v.id::text) as person,e.target,e.created_at
    from nz_metrics.events e join nz_metrics.visitors v on v.id=e.visitor_id
    where e.event='commerce' and e.target in ('land_from_header','land_from_hero','land_from_synapse','land_from_how','land_from_review','land_from_final')
      and e.created_at>=since_ts and not v.excluded
  ), paths as (
    select p.*, a.arrived, t.started_at, t.completed_at, u.created_at as profile_at, u.key as profile_key,
      (select min(m.applied_at) from public.nz_payments m where m.user_key=p.account
        and m.state='succeeded' and not m.is_test and m.kind='checkout' and m.applied_at>=a.arrived) as paid_at
    from entrants p
    left join lateral (select min(created_at) arrived from arrivals x where x.person=p.person and x.created_at>=p.opened) a on true
    left join public.nz_trials t on t.user_key=p.account
    left join public.nz_users u on u.key=p.account
  ), stages as (
    select p.*, d.summary_at,d.offer_at,d.plan_at,d.checkout_at
    from paths p
    left join lateral (
      select max(e.created_at) filter(where e.event='screen' and e.target='summary') summary_at,
        max(e.created_at) filter(where e.event='impression' and e.target in ('offer','plan_individual','plan_family')) offer_at,
        max(e.created_at) filter(where e.event='click' and e.target in ('plan_individual','plan_family')) plan_at,
        max(e.created_at) filter(where e.event='commerce' and e.target in ('checkout_submit_individual','checkout_submit_family')) checkout_at
      from nz_metrics.visitors v join nz_metrics.events e on e.visitor_id=v.id
      where (v.user_key=p.account or (p.account is null and 'browser:'||v.id::text=p.person))
        and not v.excluded and e.created_at>=p.completed_at
    ) d on p.completed_at>=p.started_at and p.started_at>=p.arrived
  ), actions as (
    select event,target,count(*) as total,count(distinct person) as visitors
    from events where event in ('impression','click','exercise','scroll')
    group by event,target
  ), confirmed as (
    select target,count(distinct a.person) as visitors from arrivals a join entrants p using(person)
    where a.created_at>=p.opened group by target
  ), times as (
    select session_id,sum(ms) as ms from landing where event='active' group by session_id
  ), sources as (
    select p.source,count(*) as visitors,count(*) filter(where arrived is not null) as arrivals,
      count(*) filter(where started_at>=arrived) as trials,count(*) filter(where paid_at>=arrived) as buyers
    from paths p group by p.source order by count(*) desc limit 15
  )
  select jsonb_build_object(
    'measured_at',now(),
    'baseline',(select coalesce(jsonb_agg(b order by measured_at),'[]'::jsonb) from nz_metrics.landing_baselines b),
    'funnel',(select jsonb_build_object(
      'visitors',count(*),
      'clicked',(select count(distinct person) from events where event='click' and target in ('land_cta_header','land_cta_hero','land_cta_synapse','land_cta_how','land_cta_review','land_cta_final')),
      'arrived',count(*) filter(where arrived is not null),
      'trial_started',count(*) filter(where started_at>=arrived),
      'trial_completed',count(*) filter(where completed_at>=started_at and started_at>=arrived),
      'summary_seen',count(*) filter(where summary_at>=completed_at and completed_at>=started_at and started_at>=arrived),
      'offer_seen',count(*) filter(where offer_at>=completed_at and completed_at>=started_at and started_at>=arrived),
      'plan_selected',count(*) filter(where plan_at>=completed_at and completed_at>=started_at and started_at>=arrived),
      'checkout_submitted',count(*) filter(where checkout_at>=completed_at and completed_at>=started_at and started_at>=arrived),
      'buyers',count(*) filter(where paid_at>=completed_at and completed_at>=started_at and started_at>=arrived),
      'profile_created_after_payment',count(*) filter(where profile_at>=paid_at and paid_at>=completed_at and completed_at>=started_at and started_at>=arrived and profile_key !~ '^g_[0-9a-f]{32}$')
    ) from stages),
    'actions',(select coalesce(jsonb_agg(actions order by event,target),'[]'::jsonb) from actions),
    'arrivals_by_button',(select coalesce(jsonb_agg(confirmed order by visitors desc),'[]'::jsonb) from confirmed),
    'active_time',(select jsonb_build_object('sessions',count(*),'median_ms',percentile_cont(.5) within group(order by ms),'avg_ms',avg(ms)) from times),
    'sources',(select coalesce(jsonb_agg(sources order by visitors desc),'[]'::jsonb) from sources)
  ) into result;
  return result;
end $$;
revoke all on function nz_metrics.landing_report(text,integer) from public;
grant execute on function nz_metrics.landing_report(text,integer) to anon,authenticated;

create or replace function public.nz_landing_report(p_token text,p_days integer default 30)
returns jsonb language sql security invoker set search_path='' as $$
  select nz_metrics.landing_report(p_token,p_days)
$$;
revoke all on function public.nz_landing_report(text,integer) from public;
grant execute on function public.nz_landing_report(text,integer) to anon,authenticated;
