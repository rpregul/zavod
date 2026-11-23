create table nz_private.first_offer_coupon (
 user_key text primary key references public.nz_users(key) on update cascade on delete cascade,
 expires_at timestamptz not null,
 applied boolean not null default false
);
revoke all on nz_private.first_offer_coupon from public, anon, authenticated;
grant select,insert,update on nz_private.first_offer_coupon to service_role;
create function public.nz_first_offer_coupon(p_token text,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare k text; c nz_private.first_offer_coupon%rowtype;
begin
 select user_key into k from public.nz_sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
 if k is null then raise exception 'unauthorized'; end if;
 if p_action='show' then
   insert into nz_private.first_offer_coupon(user_key,expires_at) values(k,clock_timestamp()+interval '10 minutes') on conflict do nothing;
 elsif p_action='apply' then
   update nz_private.first_offer_coupon set applied=true where user_key=k and expires_at>clock_timestamp() and not applied;
 elsif p_action<>'status' or p_action is null then raise exception 'invalid_action';
 end if;
 select * into c from nz_private.first_offer_coupon where user_key=k;
 return jsonb_build_object('expires_at',c.expires_at,'applied',coalesce(c.applied,false),'server_now',clock_timestamp());
end $$;
revoke all on function public.nz_first_offer_coupon(text,text) from public;
grant execute on function public.nz_first_offer_coupon(text,text) to anon,authenticated;
do $mig$
declare src text:=pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure);
anchor text:=$old$if p_data->>'consent_version'='nov21-promo-v1' then$old$;
begin
 if strpos(src,anchor)=0 then raise exception 'checkout definition mismatch';end if;
 execute replace(src,anchor,$new$if p_data->>'consent_version'='coupon-10m-v1' then
      if not exists(select 1 from nz_private.first_offer_coupon where user_key=uk and applied and expires_at>clock_timestamp()) then raise exception 'consent_required'; end if;
      checkout_price:=case when checkout_months=3 then 673 when chosen_plan='family' then 749 else 299 end;
    elsif p_data->>'consent_version'='nov21-promo-v1' then$new$);
end $mig$;