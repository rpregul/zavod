-- All synthetic records are rolled back. No provider requests and no real charges.
begin;
set local role service_role;
do $$
declare
  k text := '__test_'||replace(gen_random_uuid()::text,'-','');
  token text := encode(extensions.gen_random_bytes(32),'hex');
  r jsonb; order_id text; until_first timestamptz; status jsonb;
  payment jsonb;
begin
  assert not has_function_privilege('anon','public.nz_billing_api(text,jsonb)','execute');
  assert not has_function_privilege('authenticated','public.nz_billing_api(text,jsonb)','execute');
  assert not has_table_privilege('anon','public.nz_payments','select');
  r:=public.nz_billing_api('login',jsonb_build_object('key',k,'name',k,'hash',repeat('a',64),'create',true,'token_hash',token));
  assert r->>'status'='created';
  status:=public.nz_billing_api('status',jsonb_build_object('token_hash',token));
  assert status->>'active'='false';
  begin
    perform public.nz_billing_api('push',jsonb_build_object('token_hash',token,'rows','[]'::jsonb));
    raise exception 'test_failed_unpaid_write_allowed';
  exception when raise_exception then
    if sqlerrm <> 'subscription_required' then raise; end if;
  end;
  r:=public.nz_billing_api('checkout',jsonb_build_object('token_hash',token,'email','test@example.invalid','consent_version','299-monthly-v1'));
  order_id:=r->>'id';
  r:=public.nz_billing_api('checkout',jsonb_build_object('token_hash',token,'email','test@example.invalid','consent_version','299-monthly-v1'));
  assert r->>'id'=order_id, 'Double click must reuse the same order';
  r:=public.nz_billing_api('claim',jsonb_build_object('order_id',order_id));
  r:=public.nz_billing_api('claim',jsonb_build_object('order_id',order_id));
  assert r->>'skip'='true', 'Parallel worker must skip leased order';
  perform public.nz_billing_api('attach',jsonb_build_object('order_id',order_id,'provider_id','test-'||order_id));
  payment:=jsonb_build_object('id','test-'||order_id,'status','succeeded','paid',true,
    'amount',jsonb_build_object('value','1.00','currency','RUB'),
    'metadata',jsonb_build_object('order_id',order_id),
    'payment_method',jsonb_build_object('id','test-method','saved',true));
  begin
    perform public.nz_billing_api('settle',jsonb_build_object('order_id',order_id,'payment',payment));
    raise exception 'test_failed_wrong_amount_accepted';
  exception when raise_exception then
    if sqlerrm <> 'payment_mismatch' then raise; end if;
  end;
  payment:=jsonb_set(payment,'{amount,value}','"299.00"');
  perform public.nz_billing_api('settle',jsonb_build_object('order_id',order_id,'payment',payment));
  status:=public.nz_billing_api('status',jsonb_build_object('token_hash',token));
  assert status->>'active'='true' and status->>'auto_renew'='true';
  until_first:=(status->>'paid_until')::timestamptz;
  perform public.nz_billing_api('settle',jsonb_build_object('order_id',order_id,'payment',payment));
  status:=public.nz_billing_api('status',jsonb_build_object('token_hash',token));
  assert (status->>'paid_until')::timestamptz=until_first, 'Webhook replay must not add another month';
  perform public.nz_billing_api('cancel',jsonb_build_object('token_hash',token));
  perform public.nz_billing_api('settle',jsonb_build_object('order_id',order_id,'payment',payment));
  status:=public.nz_billing_api('status',jsonb_build_object('token_hash',token));
  assert status->>'active'='true' and status->>'auto_renew'='false';
  assert (status->>'paid_until')::timestamptz=until_first;
  update public.nz_subscriptions set paid_until=now()-interval '1 minute' where user_key=k;
  r:=public.nz_billing_api('renew',jsonb_build_object('user_key',k));
  assert r->>'skip'='true', 'Canceled subscription must not create renewal';
  update public.nz_subscriptions set auto_renew=true where user_key=k;
  r:=public.nz_billing_api('renew',jsonb_build_object('user_key',k));
  assert r->>'skip'='true', 'Renewal requires an advance reminder';
  update public.nz_subscriptions set reminder_for=paid_until,reminder_sent_at=now()-interval '25 hours' where user_key=k;
  r:=public.nz_billing_api('renew',jsonb_build_object('user_key',k));
  order_id:=r->>'id';
  assert order_id is not null;
  r:=public.nz_billing_api('renew',jsonb_build_object('user_key',k));
  assert r->>'id'=order_id, 'Renewal workers must reuse one period order';
  perform public.nz_billing_api('cancel',jsonb_build_object('token_hash',token));
  r:=public.nz_billing_api('claim',jsonb_build_object('order_id',order_id));
  assert r->>'skip'='true', 'Cancellation between reservation and dispatch prevents a new request';
  perform public.nz_billing_api('logout',jsonb_build_object('token_hash',token));
  begin
    perform public.nz_billing_api('status',jsonb_build_object('token_hash',token));
    raise exception 'test_failed_revoked_session_accepted';
  exception when raise_exception then
    if sqlerrm <> 'unauthorized' then raise; end if;
  end;
end $$;
rollback;
