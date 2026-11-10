-- Additive preparation. Apply before enabling BILLING.enabled in config.js.
-- Payment API is service_role-only; browser roles cannot read/write billing data.
create table if not exists public.nz_subscriptions (
  user_key text primary key references public.nz_users(key),
  paid_until timestamptz,
  auto_renew boolean not null default false,
  canceled_at timestamptz,
  payment_method_id text,
  email text,
  reminder_for timestamptz,
  reminder_sent_at timestamptz,
  consent_at timestamptz,
  consent_version text,
  updated_at timestamptz not null default now()
);
create table if not exists public.nz_sessions (
  token_hash text primary key,
  user_key text not null references public.nz_users(key),
  expires_at timestamptz not null default now() + interval '30 days'
);
alter table public.nz_subscriptions add column if not exists reminder_for timestamptz;
alter table public.nz_subscriptions add column if not exists reminder_sent_at timestamptz;
create index if not exists nz_sessions_expiry on public.nz_sessions(expires_at);
create table if not exists public.nz_payments (
  id uuid primary key default gen_random_uuid(),
  user_key text not null references public.nz_users(key),
  kind text not null check (kind in ('checkout','renewal')),
  period_start timestamptz not null,
  amount numeric(10,2) not null default 299.00 check (amount = 299.00),
  currency text not null default 'RUB' check (currency = 'RUB'),
  state text not null default 'creating' check (state in ('creating','pending','succeeded','canceled','review')),
  provider_id text unique,
  confirmation_url text,
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  webhook_received_at timestamptz,
  lease_until timestamptz,
  applied_at timestamptz,
  receipt_status text not null default 'required',
  unique(user_key,kind,period_start)
);
create unique index if not exists nz_one_open_payment on public.nz_payments(user_key)
  where state in ('creating','pending','review');
alter table public.nz_payments add column if not exists webhook_received_at timestamptz;
create schema if not exists nz_private;
revoke all on schema nz_private from public, anon, authenticated;
create table if not exists nz_private.job_secret (
  id boolean primary key default true check(id),
  value text not null default encode(extensions.gen_random_bytes(32),'hex')
);
insert into nz_private.job_secret(id) values(true) on conflict do nothing;
grant usage on schema nz_private to service_role;
grant select on nz_private.job_secret to service_role;
alter table nz_private.job_secret enable row level security;
alter table public.nz_subscriptions enable row level security;
alter table public.nz_sessions enable row level security;
alter table public.nz_payments enable row level security;
revoke all on public.nz_subscriptions, public.nz_sessions, public.nz_payments from public, anon, authenticated;
grant all on public.nz_subscriptions, public.nz_sessions, public.nz_payments to service_role;
grant select, insert, update on public.nz_users, public.nz_results to service_role;
grant execute on function public.nz_login(text,text,text,boolean), public.nz_check(text,text) to service_role;

create or replace function public.nz_billing_api(p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  uk text; login_result jsonb; sub public.nz_subscriptions%rowtype;
  pay public.nz_payments%rowtype; obj jsonb; rows_json jsonb;
begin
  if p_action = 'job_auth' then
    return jsonb_build_object('ok', exists(select 1 from nz_private.job_secret where value = p_data->>'token'));
  end if;
  if p_action = 'login' then
    login_result := public.nz_login(p_data->>'key',p_data->>'name',p_data->>'hash',coalesce((p_data->>'create')::boolean,false));
    if login_result->>'status' in ('ok','created') then
      delete from public.nz_sessions where expires_at < now();
      insert into public.nz_sessions(token_hash,user_key) values(p_data->>'token_hash',p_data->>'key');
    end if;
    return login_result;
  end if;
  -- These operations are called only by the trusted payment worker, never browser RPC.
  if p_action = 'due' then
    -- No new POST after the provider's idempotency window: unresolved requests require reconciliation.
    update public.nz_payments set state='review' where state='creating' and created_at < now()-interval '20 hours';
    select coalesce(jsonb_agg(to_jsonb(t)), '[]') into rows_json from (
      select p.id, p.provider_id from public.nz_payments p where p.state in ('creating','pending')
      and (p.lease_until is null or p.lease_until < now()) order by p.created_at limit 50
    ) t;
    return jsonb_build_object('payments',rows_json,'reminders',coalesce((select jsonb_agg(to_jsonb(r)) from (
      select user_key,email,paid_until from public.nz_subscriptions where auto_renew and email is not null
      and paid_until<=now()+interval '24 hours' and reminder_for is distinct from paid_until limit 50
    ) r),'[]'::jsonb),'users',coalesce((select jsonb_agg(user_key) from (
      select user_key from public.nz_subscriptions where auto_renew and paid_until <= now()
      and payment_method_id is not null order by paid_until limit 50
    ) u),'[]'::jsonb));
  end if;
  if p_action in ('claim','attach','settle','payment') then
    select * into pay from public.nz_payments where id=(p_data->>'order_id')::uuid for update;
    if not found then raise exception 'unknown_order'; end if;
    select * into sub from public.nz_subscriptions where user_key=pay.user_key for update;
    if p_action='payment' then return to_jsonb(pay); end if;
    if p_action='claim' then
      if pay.state <> 'creating' or pay.created_at < now()-interval '20 hours'
        or pay.lease_until > now() then return jsonb_build_object('skip',true); end if;
      if pay.kind='renewal' and not sub.auto_renew then
        -- A request may already have reached the provider before a timeout/cancellation.
        -- Keep it unresolved until a verified notification/reconciliation identifies it.
        update public.nz_payments set state='review' where id=pay.id;
        return jsonb_build_object('skip',true);
      end if;
      update public.nz_payments set lease_until=now()+interval '90 seconds' where id=pay.id;
      return to_jsonb(pay)||jsonb_build_object('payment_method_id',sub.payment_method_id);
    end if;
    if p_action='attach' then
      update public.nz_payments set provider_id=p_data->>'provider_id',
        confirmation_url=p_data->>'confirmation_url', state='pending', lease_until=null
        where id=pay.id and provider_id is null and state in ('creating','pending','review');
      return jsonb_build_object('ok',true);
    end if;
    obj:=p_data->'payment';
    if obj->>'id' is distinct from pay.provider_id or obj#>>'{metadata,order_id}' is distinct from pay.id::text
      or obj#>>'{amount,currency}' is distinct from 'RUB' or (obj#>>'{amount,value}')::numeric is distinct from pay.amount
      then raise exception 'payment_mismatch'; end if;
    if p_data->>'source'='webhook' then
      update public.nz_payments set webhook_received_at=now() where id=pay.id;
    end if;
    if obj->>'status'='succeeded' and obj->>'paid'='true' and pay.applied_at is null then
      update public.nz_subscriptions set
        paid_until=greatest(now(),pay.period_start)+interval '1 month',
        payment_method_id=case when obj#>>'{payment_method,saved}'='true' then obj#>>'{payment_method,id}' else payment_method_id end,
        auto_renew=case when pay.kind='checkout' then
          obj#>>'{payment_method,saved}'='true' and (canceled_at is null or canceled_at < pay.created_at)
          else auto_renew end,
        updated_at=now() where user_key=pay.user_key;
      update public.nz_payments set state='succeeded',applied_at=now(),checked_at=now(),lease_until=null where id=pay.id;
    elsif obj->>'status'='canceled' and pay.applied_at is null then
      update public.nz_payments set state='canceled',checked_at=now(),lease_until=null where id=pay.id;
      -- A declined renewal stops further automatic attempts. Customer can explicitly subscribe again.
      if pay.kind='renewal' then update public.nz_subscriptions set auto_renew=false,updated_at=now() where user_key=pay.user_key; end if;
    else update public.nz_payments set checked_at=now() where id=pay.id;
    end if;
    return jsonb_build_object('ok',true);
  end if;
  if p_action='reminded' then
    update public.nz_subscriptions set reminder_for=paid_until,reminder_sent_at=now()
      where user_key=p_data->>'user_key' and paid_until=(p_data->>'paid_until')::timestamptz and auto_renew;
    return '{"ok":true}';
  end if;
  if p_action='renew' then
    select * into sub from public.nz_subscriptions where user_key=p_data->>'user_key' for update;
    if not found or not sub.auto_renew or sub.paid_until>now() or sub.payment_method_id is null
      or sub.reminder_for is distinct from sub.paid_until or sub.reminder_sent_at>now()-interval '24 hours'
      then return jsonb_build_object('skip',true); end if;
    select * into pay from public.nz_payments where user_key=sub.user_key and state in ('creating','pending','review') limit 1;
    if not found then
      insert into public.nz_payments(user_key,kind,period_start) values(sub.user_key,'renewal',sub.paid_until)
      on conflict(user_key,kind,period_start) do nothing returning * into pay;
    end if;
    return case when pay.id is null then jsonb_build_object('skip',true) else to_jsonb(pay) end;
  end if;
  select user_key into uk from public.nz_sessions where token_hash=p_data->>'token_hash' and expires_at>now();
  if uk is null then raise exception 'unauthorized'; end if;
  if p_action='logout' then
    delete from public.nz_sessions where token_hash=p_data->>'token_hash'; return '{"ok":true}';
  end if;
  if p_action='pull' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'ex',ex,'score',score,'day',day,'ts',ts,'meta',meta) order by ts),'[]')
      into rows_json from public.nz_results where user_key=uk;
    return jsonb_build_object('status','ok','rows',rows_json);
  end if;
  insert into public.nz_subscriptions(user_key) values(uk) on conflict do nothing;
  select * into sub from public.nz_subscriptions where user_key=uk for update;
  if p_action='status' then
    return jsonb_build_object('active',coalesce(sub.paid_until>now(),false),'paid_until',sub.paid_until,
      'auto_renew',sub.auto_renew,'email',sub.email,'price',299);
  end if;
  if p_action='cancel' then
    update public.nz_subscriptions set auto_renew=false,canceled_at=now(),updated_at=now() where user_key=uk;
    return jsonb_build_object('ok',true,'paid_until',sub.paid_until);
  end if;
  if p_action='checkout' then
    if sub.paid_until>now() then raise exception 'already_active'; end if;
    if p_data->>'consent_version' is distinct from '299-monthly-v1' then raise exception 'consent_required'; end if;
    if length(p_data->>'email')>254 or p_data->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email'; end if;
    select * into pay from public.nz_payments where user_key=uk and state in ('creating','pending','review') limit 1;
    if found then return to_jsonb(pay); end if;
    update public.nz_subscriptions set email=p_data->>'email',consent_at=now(),consent_version='299-monthly-v1' where user_key=uk;
    insert into public.nz_payments(user_key,kind,period_start) values(uk,'checkout',now()) returning * into pay;
    return to_jsonb(pay);
  end if;
  if p_action='push' then
    if not coalesce(sub.paid_until>now(),false) then raise exception 'subscription_required'; end if;
    if jsonb_typeof(p_data->'rows')<>'array' or jsonb_array_length(p_data->'rows')>200 then raise exception 'invalid_rows'; end if;
    insert into public.nz_results(id,user_key,ex,score,day,ts,meta)
      select (r->>'id')::uuid,uk,r->>'ex',(r->>'score')::int,(r->>'day')::date,(r->>'ts')::bigint,coalesce(r->'meta','{}')
      from jsonb_array_elements(p_data->'rows') r on conflict(id) do nothing;
    return '{"status":"ok"}';
  end if;
  raise exception 'unknown_action';
end $$;
revoke all on function public.nz_billing_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.nz_billing_api(text,jsonb) to service_role;

-- Activation AFTER checkout, recurring payments and cancellation pass end-to-end tests:
-- revoke execute on function public.nz_login(text,text,text,boolean), public.nz_pull(text,text), public.nz_push(text,text,jsonb) from anon,authenticated;
