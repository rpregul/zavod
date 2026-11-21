alter table nz_metrics.visits add column country_code text;
alter table public.nz_payments add column cancellation_reason text, add column cancellation_party text;
do $$
declare d text:=pg_get_functiondef('nz_metrics.record_visit(uuid,text,text)'::regprocedure);
needle text:='insert into nz_metrics.visits(visitor_id) values(p_visitor) on conflict do nothing;';
begin
if strpos(d,needle)=0 then raise exception 'visit signature changed'; end if;
execute replace(d,needle,$new$insert into nz_metrics.visits(visitor_id,country_code)
select p_visitor,case when code ~ '^[A-Z]{2}$' and code not in ('XX','ZZ') then code end
from (select upper(current_setting('request.headers',true)::jsonb->>'cf-ipcountry') code) h
on conflict(visitor_id,day) do update set country_code=coalesce(nz_metrics.visits.country_code,excluded.country_code);$new$);
d:=pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure);
needle:='if p_data->>''source''=''webhook'' then';
if strpos(d,needle)=0 then raise exception 'settlement signature changed';end if;
execute replace(d,needle,$new$if obj->>'status'='canceled' then
update public.nz_payments set cancellation_reason=coalesce(obj#>>'{cancellation_details,reason}',cancellation_reason),cancellation_party=coalesce(obj#>>'{cancellation_details,party}',cancellation_party) where id=pay.id;
end if;
$new$||needle);
end $$;
create function public.nz_geo_report(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
if not exists(select 1 from public.nz_sessions where user_key='рома' and expires_at>now() and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')) then raise exception 'forbidden';end if;
return (select coalesce(jsonb_object_agg(code,n),'{}') from (select coalesce(country_code,'unknown') code,count(distinct coalesce(v.user_key,v.id::text)) n from nz_metrics.visits t join nz_metrics.visitors v on v.id=t.visitor_id where not v.excluded and day>=greatest(date '2026-11-21',(now() at time zone 'Europe/Moscow')::date-13) group by 1)x);
end $$;
revoke all on function public.nz_geo_report(text) from public;
grant execute on function public.nz_geo_report(text) to anon,authenticated;