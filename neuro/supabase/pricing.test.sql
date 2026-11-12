begin;
do $$
declare
  suffix text := replace(gen_random_uuid()::text,'-','');
  user_a text; user_b text; user_c text;
  hash_a text := encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  hash_b text := encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  hash_c text := encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  individual jsonb; family jsonb; repeated jsonb;
begin
  user_a:='__qa_price_a_'||suffix; user_b:='__qa_price_b_'||suffix; user_c:='__qa_price_c_'||suffix;
  insert into public.nz_users(key,name,hash) values(user_a,user_a,repeat('a',64)),(user_b,user_b,repeat('a',64)),(user_c,user_c,repeat('a',64));
  insert into public.nz_sessions(user_key,token_hash) values(user_a,hash_a),(user_b,hash_b),(user_c,hash_c);
  individual:=public.nz_billing_api('checkout',jsonb_build_object('token_hash',hash_a,'email','','consent_version','monthly-plans-v4-once','plan','individual','amount',1));
  family:=public.nz_billing_api('checkout',jsonb_build_object('token_hash',hash_b,'email','','consent_version','monthly-plans-v4-once','plan','family','amount',1));
  assert (individual->>'amount')::numeric=399,'individual pricing mismatch';
  assert (family->>'amount')::numeric=999,'family pricing mismatch';
  repeated:=public.nz_billing_api('checkout',jsonb_build_object('token_hash',hash_a,'email','','consent_version','monthly-plans-v4-once','plan','individual'));
  assert repeated->>'id'=individual->>'id','duplicate order on retry';
  assert (public.nz_billing_api('status',jsonb_build_object('token_hash',hash_a))->>'price')::int=399;
  begin
    perform public.nz_billing_api('checkout',jsonb_build_object('token_hash',hash_c,'email','','consent_version','monthly-plans-v3-once','plan','individual'));
    raise exception 'stale consent accepted';
  exception when others then if sqlerrm<>'consent_required' then raise; end if; end;
  update public.nz_payments set amount=299 where id=(individual->>'id')::uuid;
  begin
    perform public.nz_billing_api('checkout',jsonb_build_object('token_hash',hash_a,'email','','consent_version','monthly-plans-v4-once','plan','individual'));
    raise exception 'old quote reused with new price';
  exception when others then if sqlerrm<>'checkout_in_progress' then raise; end if; end;
  assert (select amount=299 from public.nz_payments where id=(individual->>'id')::uuid),'old order changed in place';
end $$;
select 'PASS server prices, ignored client amount, idempotency, old-consent rejection and preserved old quote' result;
rollback;
