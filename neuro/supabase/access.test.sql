-- Trial and family entitlement tests. No real users or provider calls; roll back everything.
begin;
set local role service_role;
do $$
declare
  keys text[] := '{}'; tokens text[] := '{}'; invites text[] := '{}';
  k text; t text; i int; r jsonb; trial_id text; rec_id uuid; order_id text;
  exs text[] := array['sch_f','sch_r','dob','mem'];
begin
  for i in 1..5 loop
    k:='t'||replace(gen_random_uuid()::text,'-',''); t:=encode(extensions.gen_random_bytes(32),'hex');
    keys:=array_append(keys,k); tokens:=array_append(tokens,t);
    perform public.nz_billing_api('login',jsonb_build_object('key',k,'name',k,'hash',repeat('c',64),'create',true,'token_hash',t));
  end loop;
  r:=public.nz_billing_api('trial_start',jsonb_build_object('token_hash',tokens[1]));
  trial_id:=r->>'trial_id'; assert r->>'next_index'='0';
  begin
    perform public.nz_billing_api('trial_result',jsonb_build_object('token_hash',tokens[1],'trial_id',trial_id,'row',jsonb_build_object('id',gen_random_uuid(),'ex','mem','score',10)));
    raise exception 'wrong_trial_order_allowed';
  exception when raise_exception then if sqlerrm<>'trial_order' then raise; end if; end;
  for i in 1..4 loop
    rec_id:=gen_random_uuid();
    r:=public.nz_billing_api('trial_result',jsonb_build_object('token_hash',tokens[1],'trial_id',trial_id,'row',jsonb_build_object('id',rec_id,'ex',exs[i],'score',10)));
    assert (r->>'next_index')::int=i;
    -- Lost network response retry must not consume another exercise.
    r:=public.nz_billing_api('trial_result',jsonb_build_object('token_hash',tokens[1],'trial_id',trial_id,'row',jsonb_build_object('id',rec_id,'ex',exs[i],'score',10)));
    assert (r->>'next_index')::int=i;
  end loop;
  r:=public.nz_billing_api('status',jsonb_build_object('token_hash',tokens[1]));
  assert r#>>'{trial,completed}'='true'; assert r->>'active'='false';
  begin
    perform public.nz_billing_api('trial_start',jsonb_build_object('token_hash',tokens[1])); raise exception 'second_trial_allowed';
  exception when raise_exception then if sqlerrm<>'trial_completed' then raise; end if; end;
  r:=public.nz_billing_api('checkout',jsonb_build_object('token_hash',tokens[1],'email','qa@example.invalid','plan','family','consent_version','monthly-plans-v2'));
  assert r->>'plan'='family' and (r->>'amount')::numeric=599;
  order_id:=r->>'id';
  perform public.nz_billing_api('attach',jsonb_build_object('order_id',order_id,'provider_id','test-'||order_id));
  perform public.nz_billing_api('settle',jsonb_build_object('order_id',order_id,'payment',jsonb_build_object('id','test-'||order_id,'status','succeeded','paid',true,'amount',jsonb_build_object('value','599.00','currency','RUB'),'metadata',jsonb_build_object('order_id',order_id),'payment_method',jsonb_build_object('id','test-method','saved',true))));
  for i in 2..4 loop
    t:=encode(extensions.gen_random_bytes(32),'hex'); invites:=array_append(invites,t);
    perform public.nz_billing_api('family_invite',jsonb_build_object('token_hash',tokens[1],'invite_hash',t));
    perform public.nz_billing_api('family_join',jsonb_build_object('token_hash',tokens[i],'invite_hash',t));
    perform public.nz_billing_api('family_join',jsonb_build_object('token_hash',tokens[i],'invite_hash',t));
    r:=public.nz_billing_api('status',jsonb_build_object('token_hash',tokens[i]));
    assert r->>'active'='true' and r->>'family_member'='true';
    r:=public.nz_billing_api('pull',jsonb_build_object('token_hash',tokens[i])); assert r->'rows'='[]'::jsonb, 'History must remain private';
  end loop;
  begin
    perform public.nz_billing_api('family_invite',jsonb_build_object('token_hash',tokens[1],'invite_hash',repeat('f',64))); raise exception 'fifth_seat_allowed';
  exception when raise_exception then if sqlerrm<>'family_full' then raise; end if; end;
  begin
    perform public.nz_billing_api('family_join',jsonb_build_object('token_hash',tokens[5],'invite_hash',invites[1])); raise exception 'reused_invite_allowed';
  exception when raise_exception then if sqlerrm<>'invalid_invite' then raise; end if; end;
  perform public.nz_billing_api('cancel',jsonb_build_object('token_hash',tokens[2]));
  r:=public.nz_billing_api('status',jsonb_build_object('token_hash',tokens[1])); assert r->>'auto_renew'='true', 'Member cannot cancel owner billing';
  perform public.nz_billing_api('family_remove',jsonb_build_object('token_hash',tokens[1],'member_key',keys[2]));
  r:=public.nz_billing_api('status',jsonb_build_object('token_hash',tokens[2])); assert r->>'active'='false';
  perform public.nz_billing_api('cancel',jsonb_build_object('token_hash',tokens[1]));
  r:=public.nz_billing_api('status',jsonb_build_object('token_hash',tokens[3])); assert r->>'active'='true', 'Cancellation keeps family access through paid term';
  update public.nz_subscriptions set paid_until=now()-interval '1 minute' where user_key=keys[1];
  r:=public.nz_billing_api('status',jsonb_build_object('token_hash',tokens[3])); assert r->>'active'='false';
end $$;
rollback;
