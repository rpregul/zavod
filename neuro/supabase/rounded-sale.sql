alter table public.nz_payments drop constraint nz_payments_plan_amount_check;
alter table public.nz_payments add constraint nz_payments_plan_amount_check check ((plan='individual' and amount in (299,399,199.50,199)) or (plan='family' and amount in (599,999,499.50,499)));
do $$declare d text;begin
select pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure) into d;
if strpos(d,'black-friday-2026-v1')=0 then raise exception 'pricing signature changed';end if;
d:=replace(d,'then 499.50 else 199.50 end','then 499 else 199 end');
d:=replace(d,'black-friday-2026-v1','black-friday-2026-v2');execute d;
end $$;
