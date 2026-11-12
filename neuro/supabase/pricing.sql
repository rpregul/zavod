-- New checkout requests must acknowledge the 399/999 offer shown by this release.
-- Existing orders retain their quoted amount and are never repriced in place.
alter table public.nz_payments alter column amount set default 399.00;
do $$
declare definition text;
begin
  select pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure) into definition;
  if strpos(definition,'then 599 else 299 end')=0 or strpos(definition,'''monthly-plans-v3-once''')=0 then
    raise exception 'billing pricing signature changed';
  end if;
  definition := replace(definition,'then 599 else 299 end','then 999 else 399 end');
  definition := replace(definition,
    'if not coalesce(p_data->>''consent_version'' in (''monthly-plans-v2'',''monthly-plans-v3-once'') or (chosen_plan=''individual'' and p_data->>''consent_version''=''299-monthly-v1''),false) then raise exception ''consent_required''; end if;',
    'if p_data->>''consent_version'' is distinct from ''monthly-plans-v4-once'' then raise exception ''consent_required''; end if;');
  if strpos(definition,'''monthly-plans-v4-once''')=0 then raise exception 'consent signature changed'; end if;
  definition := replace(definition,
    'if pay.plan<>chosen_plan then raise exception ''checkout_in_progress''; end if;',
    'if pay.plan<>chosen_plan or pay.amount<>(case when chosen_plan=''family'' then 999 else 399 end) then raise exception ''checkout_in_progress''; end if;');
  execute definition;
end $$;
-- Retain valid historical quotes while allowing the new server-controlled prices.
alter table public.nz_payments drop constraint nz_payments_plan_amount_check;
alter table public.nz_payments add constraint nz_payments_plan_amount_check
check ((plan='individual' and amount in (299,399)) or (plan='family' and amount in (599,999)));
