create function nz_metrics.claim_guest(p_token text,p_name text,p_key text,p_hash text) returns text language plpgsql security definer set search_path='' as $$
declare oldkey text;
begin
 select user_key into oldkey from public.nz_sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now() for update;
 if oldkey is null then raise exception 'unauthorized'; end if;
 if oldkey=p_key and exists(select 1 from public.nz_users where key=p_key and hash=p_hash) then return 'ok'; end if;
 if oldkey !~ '^g_[0-9a-f]{32}$' or not exists(select 1 from public.nz_payments where user_key=oldkey and state='succeeded' and not is_test and kind='checkout') then raise exception 'payment_required'; end if;
 if p_name is null or p_key is null or p_hash is null or length(p_key) not between 1 and 30 or p_key<>replace(lower(trim(p_name)),'ё','е') or p_key ~ '^(__|g_)' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_profile'; end if;
 insert into public.nz_users(key,name,hash) values(p_key,p_name,p_hash) on conflict do nothing;
 if not found then return 'name_taken'; end if;
 update public.nz_results set user_key=p_key where user_key=oldkey;
 update public.nz_trials set user_key=p_key where user_key=oldkey;
 update public.nz_payments set user_key=p_key where user_key=oldkey;
 update public.nz_subscriptions set user_key=p_key where user_key=oldkey;
 update public.nz_sessions set user_key=p_key where user_key=oldkey;
 update public.nz_family_members set user_key=p_key where user_key=oldkey;
 update public.nz_family_members set owner_key=p_key where owner_key=oldkey;
 update public.nz_family_invites set owner_key=p_key where owner_key=oldkey;
 update public.nz_family_invites set used_by=p_key where used_by=oldkey;
 update nz_metrics.visitors set user_key=p_key where user_key=oldkey;
 update nz_metrics.events set user_key=p_key where user_key=oldkey;
 delete from public.nz_users where key=oldkey;
 return 'ok';
end $$;
revoke all on function nz_metrics.claim_guest(text,text,text,text) from public;
grant execute on function nz_metrics.claim_guest(text,text,text,text) to anon;
create function public.nz_claim_guest(p_token text,p_name text,p_key text,p_hash text) returns text language sql security invoker set search_path='' as $$select nz_metrics.claim_guest(p_token,p_name,p_key,p_hash)$$;
revoke all on function public.nz_claim_guest(text,text,text,text) from public;
grant execute on function public.nz_claim_guest(text,text,text,text) to anon;
do $$ declare d text; begin
 select pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure) into d;
 if strpos(d,'if length(p_data->>''email'')>254')=0 then raise exception 'checkout changed'; end if;
 execute replace(replace(d,'if length(p_data->>''email'')>254','if coalesce(p_data->>''email'','''')<>'''' and (length(p_data->>''email'')>254'),'then raise exception ''invalid_email'';',') then raise exception ''invalid_email'';');
end $$;
-- The exception rolls back all synthetic data before the migration commits.
do $$ declare
 g text:='g_'||replace(gen_random_uuid()::text,'-','');
 dest text:='check_'||substr(gen_random_uuid()::text,1,12);
 tok text:=gen_random_uuid()::text;
 th text:=encode(sha256(convert_to(tok,'UTF8')),'hex');
 h text:=repeat('a',64); order_row jsonb;
begin
 begin
 insert into public.nz_users(key,name,hash) values(g,g,h);
 insert into public.nz_sessions(user_key,token_hash) values(g,th);
 perform public.nz_billing_api('trial_start',jsonb_build_object('token_hash',th));
 order_row:=public.nz_billing_api('checkout',jsonb_build_object('token_hash',th,'email','','consent_version','monthly-plans-v3-once','plan','individual'));
 if order_row->>'id' is null then raise exception 'checkout test failed'; end if;
 begin
 perform public.nz_claim_guest(tok,dest,dest,h);
 raise exception 'unpaid claim accepted';
 exception when others then if sqlerrm<>'payment_required' then raise;end if;end;
 update public.nz_payments set state='succeeded',is_test=false where id=(order_row->>'id')::uuid;
 if public.nz_claim_guest(tok,'Рома','рома',h)<>'name_taken' then raise exception 'collision test failed';end if;
 if public.nz_claim_guest(tok,dest,dest,h)<>'ok' or public.nz_claim_guest(tok,dest,dest,h)<>'ok' then raise exception 'claim test failed';end if;
 if not exists(select from public.nz_trials where user_key=dest) or not exists(select from public.nz_payments where user_key=dest) or (public.nz_login(dest,dest,h,false)->>'status')<>'ok' then raise exception 'transfer test failed';end if;
 raise exception using errcode='Z9001';
 exception when sqlstate 'Z9001' then null;end;
end $$;
