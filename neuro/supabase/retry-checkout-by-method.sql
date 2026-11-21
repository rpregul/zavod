drop index public.nz_one_open_payment;
create unique index nz_one_open_payment on public.nz_payments(user_key,checkout_method) where state in ('creating','pending','review');
do $$ declare d text:=pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure);
a text:='select * into pay from public.nz_payments where user_key=uk and state in (''creating'',''pending'',''review'') limit 1;';
b text:='if pay.checkout_method<>coalesce(p_data->>''checkout_method'',''auto'') then raise exception ''checkout_method_pending''; end if;';
begin
if strpos(d,a)=0 or strpos(d,b)=0 then raise exception 'unexpected checkout definition'; end if;
d:=replace(d,a,$body$if exists(select 1 from public.nz_payments where user_key=uk and state in ('creating','pending','review') and (kind<>'checkout' or plan<>chosen_plan or amount<>checkout_price or duration_months<>checkout_months)) then raise exception 'checkout_in_progress'; end if;
select * into pay from public.nz_payments where user_key=uk and checkout_method=coalesce(p_data->>'checkout_method','auto') and state in ('creating','pending','review') limit 1;$body$);
d:=replace(d,'values(uk,''checkout'',now(),chosen_plan','values(uk,''checkout'',clock_timestamp(),chosen_plan');execute replace(d,b,'');end $$;