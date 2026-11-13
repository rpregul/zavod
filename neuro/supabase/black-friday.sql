alter table public.nz_payments drop constraint nz_payments_plan_amount_check;
alter table public.nz_payments add constraint nz_payments_plan_amount_check check ((plan='individual' and amount in (299,399,199.50)) or (plan='family' and amount in (599,999,499.50)));
CREATE OR REPLACE FUNCTION public.nz_billing_api(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  uk text; login_result jsonb; sub public.nz_subscriptions%rowtype;
  pay public.nz_payments%rowtype; obj jsonb; rows_json jsonb;
  trial public.nz_trials%rowtype; family_sub public.nz_subscriptions%rowtype;
  owner_k text; chosen_plan text; entitled boolean; expected_ex text;
  checkout_price numeric; sale_active boolean := now() >= timestamptz '2026-11-13 00:00:00+03' and now() < timestamptz '2026-11-14 00:00:00+03';
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
      select user_key,email,paid_until,plan,case when plan='family' then 999 else 399 end as amount from public.nz_subscriptions where auto_renew and email is not null
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
        plan=pay.plan,
        paid_until=greatest(now(),pay.period_start)+interval '1 month',
        payment_method_id=case when obj#>>'{payment_method,saved}'='true' then obj#>>'{payment_method,id}' else payment_method_id end,
        auto_renew=case when pay.kind='checkout' then
          obj#>>'{payment_method,saved}'='true' and (canceled_at is null or canceled_at < pay.created_at)
          else auto_renew end,
        updated_at=now() where user_key=pay.user_key;
      update public.nz_payments set state='succeeded',is_test=coalesce((obj->>'test')::boolean,true),applied_at=now(),checked_at=now(),lease_until=null where id=pay.id;
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
      insert into public.nz_payments(user_key,kind,period_start,plan,amount) values(sub.user_key,'renewal',sub.paid_until,sub.plan,case when sub.plan='family' then 999 else 399 end)
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
  select * into trial from public.nz_trials where user_key=uk;
  select owner_key into owner_k from public.nz_family_members where user_key=uk;
  if owner_k is not null then select * into family_sub from public.nz_subscriptions where user_key=owner_k and plan='family'; end if;
  entitled:=coalesce(sub.paid_until>now(),false) or coalesce(family_sub.paid_until>now(),false);
  if p_action='status' then
    return jsonb_build_object('active',entitled,'paid_until',case when sub.paid_until>now() then sub.paid_until else family_sub.paid_until end,
      'auto_renew',sub.auto_renew,'email',sub.email,'price',case when sub.plan='family' then 999 else 399 end,
      'plan',case when sub.paid_until>now() then sub.plan when family_sub.paid_until>now() then 'family' else sub.plan end,
      'family_member',coalesce(family_sub.paid_until>now(),false) and not coalesce(sub.paid_until>now(),false),'in_family',owner_k is not null,
      'trial',jsonb_build_object('started',trial.id is not null,'completed',trial.completed_at is not null,'next_index',coalesce(trial.next_index,0)));
  end if;
  if p_action='trial_start' then
    if entitled then return jsonb_build_object('paid',true); end if;
    insert into public.nz_trials(user_key) values(uk) on conflict do nothing;
    select * into trial from public.nz_trials where user_key=uk for update;
    if trial.completed_at is not null then raise exception 'trial_completed'; end if;
    return jsonb_build_object('trial_id',trial.id,'next_index',trial.next_index);
  end if;
  if p_action='trial_result' then
    select * into trial from public.nz_trials where user_key=uk for update;
    if trial.id is null or trial.id is distinct from (p_data->>'trial_id')::uuid then raise exception 'invalid_trial'; end if;
    obj:=p_data->'row';
    if exists(select 1 from public.nz_results where id=(obj->>'id')::uuid and user_key=uk and meta->>'trial_id'=trial.id::text) then
      return jsonb_build_object('status','ok','next_index',trial.next_index,'completed',trial.completed_at is not null);
    end if;
    if trial.next_index>=4 then raise exception 'trial_completed'; end if;
    expected_ex:=(array['sch_f','sch_r','dob','mem'])[trial.next_index+1];
    if obj->>'ex' is distinct from expected_ex then raise exception 'trial_order'; end if;
    insert into public.nz_results(id,user_key,ex,score,day,ts,meta) values(
      (obj->>'id')::uuid,uk,expected_ex,(obj->>'score')::int,(now() at time zone 'Europe/Moscow')::date,
      (extract(epoch from now())*1000)::bigint,coalesce(obj->'meta','{}')||jsonb_build_object('trial_id',trial.id));
    update public.nz_trials set next_index=next_index+1,completed_at=case when next_index=3 then now() else null end where user_key=uk;
    return jsonb_build_object('status','ok','next_index',trial.next_index+1,'completed',trial.next_index=3);
  end if;
  if p_action='family_info' then
    if not entitled then raise exception 'subscription_required'; end if;
    if sub.plan<>'family' or not coalesce(sub.paid_until>now(),false) then return jsonb_build_object('owner',false); end if;
    return jsonb_build_object('owner',true,'members',coalesce((select jsonb_agg(jsonb_build_object('key',u.key,'name',u.name)) from public.nz_family_members m join public.nz_users u on u.key=m.user_key where m.owner_key=uk),'[]'),
      'reserved',(select count(*) from public.nz_family_invites where owner_key=uk and used_by is null and expires_at>now()));
  end if;
  if p_action='family_invite' then
    if sub.plan<>'family' or not coalesce(sub.paid_until>now(),false) then raise exception 'family_owner_required'; end if;
    if (select count(*) from public.nz_family_members where owner_key=uk)+(select count(*) from public.nz_family_invites where owner_key=uk and used_by is null and expires_at>now())>=3 then raise exception 'family_full'; end if;
    insert into public.nz_family_invites(token_hash,owner_key) values(p_data->>'invite_hash',uk);
    return '{"ok":true}';
  end if;
  if p_action='family_revoke_invites' then
    update public.nz_family_invites set expires_at=now() where owner_key=uk and used_by is null;
    return '{"ok":true}';
  end if;
  if p_action='family_join' then
    select owner_key into owner_k from public.nz_family_invites where token_hash=p_data->>'invite_hash' and (used_by is null or used_by=uk) and expires_at>now();
    if owner_k is null or owner_k=uk then raise exception 'invalid_invite'; end if;
    select * into family_sub from public.nz_subscriptions where user_key=owner_k for update;
    if family_sub.plan<>'family' or not coalesce(family_sub.paid_until>now(),false) then raise exception 'invalid_invite'; end if;
    if exists(select 1 from public.nz_family_members where user_key=uk and owner_key=owner_k) then return '{"ok":true}'; end if;
    if coalesce(sub.paid_until>now(),false) or exists(select 1 from public.nz_family_members where user_key=uk) then raise exception 'already_active'; end if;
    if (select count(*) from public.nz_family_members where owner_key=owner_k)>=3 then raise exception 'family_full'; end if;
    update public.nz_family_invites set used_by=uk where token_hash=p_data->>'invite_hash' and used_by is null and expires_at>now();
    if not found then raise exception 'invalid_invite'; end if;
    insert into public.nz_family_members(user_key,owner_key) values(uk,owner_k);
    return '{"ok":true}';
  end if;
  if p_action='family_remove' then
    delete from public.nz_family_members where owner_key=uk and user_key=p_data->>'member_key'; return '{"ok":true}';
  end if;
  if p_action='family_leave' then
    delete from public.nz_family_members where user_key=uk; return '{"ok":true}';
  end if;
  if p_action='cancel' then
    update public.nz_subscriptions set auto_renew=false,canceled_at=now(),updated_at=now() where user_key=uk;
    return jsonb_build_object('ok',true,'paid_until',sub.paid_until);
  end if;
  if p_action='checkout' then
    if entitled then raise exception 'already_active'; end if;
    chosen_plan:=coalesce(p_data->>'plan','individual');
    if chosen_plan not in ('individual','family') then raise exception 'invalid_plan'; end if;
    checkout_price := case when sale_active then case when chosen_plan='family' then 499.50 else 199.50 end else case when chosen_plan='family' then 999 else 399 end end;
    if p_data->>'consent_version' is distinct from (case when sale_active then 'black-friday-2026-v1' else 'monthly-plans-v4-once' end) then raise exception 'consent_required'; end if;
    if coalesce(p_data->>'email','')<>'' and (length(p_data->>'email')>254 or coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' ) then raise exception 'invalid_email'; end if;
    select * into pay from public.nz_payments where user_key=uk and state in ('creating','pending','review') limit 1;
    if found then
      if pay.plan<>chosen_plan or pay.amount<>checkout_price then raise exception 'checkout_in_progress'; end if;
      return to_jsonb(pay);
    end if;
    update public.nz_subscriptions set email=p_data->>'email',consent_at=now(),consent_version=p_data->>'consent_version' where user_key=uk;
    insert into public.nz_payments(user_key,kind,period_start,plan,amount) values(uk,'checkout',now(),chosen_plan,checkout_price) returning * into pay;
    return to_jsonb(pay);
  end if;
  if p_action='push' then
    if not entitled then raise exception 'subscription_required'; end if;
    if jsonb_typeof(p_data->'rows')<>'array' or jsonb_array_length(p_data->'rows')>200 then raise exception 'invalid_rows'; end if;
    insert into public.nz_results(id,user_key,ex,score,day,ts,meta)
      select (r->>'id')::uuid,uk,r->>'ex',(r->>'score')::int,(r->>'day')::date,(r->>'ts')::bigint,coalesce(r->'meta','{}')
      from jsonb_array_elements(p_data->'rows') r on conflict(id) do nothing;
    return '{"status":"ok"}';
  end if;
  raise exception 'unknown_action';
end $function$

