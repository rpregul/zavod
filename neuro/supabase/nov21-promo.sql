alter table public.nz_payments add column if not exists duration_months smallint not null default 1;
alter table public.nz_payments drop constraint nz_payments_plan_amount_check;
alter table public.nz_payments add constraint nz_payments_plan_amount_check check (
  (duration_months=1 and ((plan='individual' and amount in (199,199.50,299,399)) or (plan='family' and amount in (499,499.50,599,749,999))))
  or (duration_months=3 and kind='checkout' and plan='individual' and amount in (673,897.75))
);
do $migration$
declare d text; old_checkout text; new_checkout text;
begin
  d:=pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure);
  old_checkout:=$old$    chosen_plan:=coalesce(p_data->>'plan','individual');
    if chosen_plan not in ('individual','family') then raise exception 'invalid_plan'; end if;
    checkout_price := case when sale_active then case when chosen_plan='family' then 499 else 199 end else case when chosen_plan='family' then 999 else 399 end end;
    if p_data->>'consent_version' is distinct from (case when sale_active then 'black-friday-2026-v2' else 'monthly-plans-v4-once' end) then raise exception 'consent_required'; end if;$old$;
  new_checkout:=$new$    chosen_plan:=coalesce(p_data->>'plan','individual');
    if chosen_plan not in ('individual','family','quarter') then raise exception 'invalid_plan'; end if;
    if chosen_plan='quarter' then
      chosen_plan:='individual';
      checkout_months:=3;
    end if;
    if p_data->>'consent_version'='nov21-promo-v1' then
      if not sale_active then raise exception 'consent_required'; end if;
      checkout_price:=case when checkout_months=3 then 673 when chosen_plan='family' then 749 else 299 end;
    else
      if p_data->>'consent_version' is distinct from (case when checkout_months=3 then 'quarter-v1-once' else 'monthly-plans-v4-once' end) then raise exception 'consent_required'; end if;
      checkout_price:=case when checkout_months=3 then 897.75 when chosen_plan='family' then 999 else 399 end;
    end if;$new$;
  if strpos(d,old_checkout)=0 or strpos(d,'paid_until=greatest(now(),pay.period_start)+interval ''1 month''')=0
    or strpos(d,'if pay.plan<>chosen_plan or pay.amount<>checkout_price')=0
    or strpos(d,'values(uk,''checkout'',now(),chosen_plan,checkout_price)')=0
  then raise exception 'Unexpected checkout SQL'; end if;
  d:=replace(d,old_checkout,new_checkout);
  d:=replace(d,'checkout_price numeric; sale_active boolean := now() >= timestamptz ''2026-11-13 00:00:00+03'' and now() < timestamptz ''2026-11-14 00:00:00+03'';',
    'checkout_price numeric; checkout_months smallint := 1; sale_active boolean := now() >= timestamptz ''2026-11-21 00:00:00+03'' and now() < timestamptz ''2026-11-22 00:00:00+03'';');
  d:=replace(d,'paid_until=greatest(now(),pay.period_start)+interval ''1 month''','paid_until=greatest(now(),pay.period_start)+make_interval(months=>pay.duration_months::int)');
  d:=replace(d,'if pay.plan<>chosen_plan or pay.amount<>checkout_price','if pay.plan<>chosen_plan or pay.amount<>checkout_price or pay.duration_months<>checkout_months');
  d:=replace(d,'insert into public.nz_payments(user_key,kind,period_start,plan,amount) values(uk,''checkout'',now(),chosen_plan,checkout_price)',
    'insert into public.nz_payments(user_key,kind,period_start,plan,amount,duration_months) values(uk,''checkout'',now(),chosen_plan,checkout_price,checkout_months)');
  if strpos(d,'checkout_months smallint')=0 then raise exception 'Unexpected promotion dates'; end if;
  execute d;
end $migration$;
do $reports$
declare sig regprocedure; d text;
begin
  foreach sig in array array['nz_metrics.landing_report(text,integer)'::regprocedure,'nz_metrics.funnel_report(text,integer)'::regprocedure] loop
    d:=pg_get_functiondef(sig);
    d:=replace(d,'''plan_individual'',''plan_family''','''plan_individual'',''plan_family'',''plan_quarter''');
    d:=replace(d,'''checkout_submit_individual'',''checkout_submit_family''','''checkout_submit_individual'',''checkout_submit_family'',''checkout_submit_quarter''');
    execute d;
  end loop;
end $reports$;
do $settle$
declare d text;
begin
 d:=pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure);
 if strpos(d, 'obj#>>''{payment_method,saved}''=''true'' and (canceled_at')=0 then raise exception 'Unexpected settlement SQL'; end if;
 d:=replace(d,'obj#>>''{payment_method,saved}''=''true'' and (canceled_at','coalesce(obj#>>''{payment_method,saved}''=''true'',false) and (canceled_at');
 execute d;
end $settle$;
