create table nz_private.reminder_config(id boolean primary key default true check(id),public_key text,private_key text,job_token text not null default encode(extensions.gen_random_bytes(32),'hex'));
insert into nz_private.reminder_config(id) values(true);
alter table nz_private.reminder_config enable row level security;
revoke all on nz_private.reminder_config from public,anon,authenticated;
create table nz_metrics.reminders(user_key text primary key references public.nz_users(key) on delete cascade,on_time time not null default '09:00',timezone text not null default 'Europe/Moscow',enabled boolean not null default false,last_seen_at timestamptz not null default now(),last_sent_at timestamptz,last_attempt_at timestamptz,consent_at timestamptz);
create table nz_metrics.push_devices(id uuid primary key default gen_random_uuid(),user_key text not null references public.nz_users(key) on delete cascade,endpoint_hash text unique not null,subscription jsonb not null,enabled boolean not null default true,updated_at timestamptz not null default now());
alter table nz_metrics.reminders enable row level security;alter table nz_metrics.push_devices enable row level security;
revoke all on nz_metrics.reminders,nz_metrics.push_devices from public,anon,authenticated;
create function nz_metrics.reminders_api(p_token text,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare uk text; prefs nz_metrics.reminders%rowtype; endpoint text; hh time; zone text;
begin
 select user_key into uk from public.nz_sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
 if uk is null then raise exception 'unauthorized';end if;
 if p_action='touch' then update nz_metrics.reminders set last_seen_at=now() where user_key=uk;return '{"ok":true}';end if;
 if p_action='disable' then update nz_metrics.reminders set enabled=false where user_key=uk;update nz_metrics.push_devices set enabled=false where user_key=uk;end if;
 if p_action='enable' then
  if p_data->>'consent' is distinct from 'true' then raise exception 'consent_required';end if;
  if p_data->>'time' is null or p_data->>'time' !~ '^[0-2][0-9]:[0-5][0-9]$' then raise exception 'invalid_time';end if;
  hh:=(p_data->>'time')::time;zone:=p_data->>'timezone';
  if hh<'07:00'::time or hh>'22:00'::time then raise exception 'quiet_hours';end if;
  if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'invalid_timezone';end if;
  endpoint:=p_data#>>'{subscription,endpoint}';
  if endpoint is null or length(endpoint)>4096 or endpoint !~ '^https://(fcm[.]googleapis[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]push[.]services[.]mozilla[.]com|[a-z0-9.-]+[.]notify[.]windows[.]com)/' then raise exception 'invalid_endpoint';end if;
  if coalesce(p_data#>>'{subscription,keys,p256dh}','') !~ '^[A-Za-z0-9_-]{87}={0,2}$' or coalesce(p_data#>>'{subscription,keys,auth}','') !~ '^[A-Za-z0-9_-]{22}={0,2}$' then raise exception 'invalid_keys';end if;
  insert into nz_metrics.reminders(user_key,on_time,timezone,enabled,consent_at) values(uk,hh,zone,true,now()) on conflict(user_key) do update set on_time=excluded.on_time,timezone=excluded.timezone,enabled=true,consent_at=now(),last_seen_at=now();
  update nz_metrics.push_devices set enabled=false where user_key=uk;
  insert into nz_metrics.push_devices(user_key,endpoint_hash,subscription) values(uk,encode(sha256(convert_to(endpoint,'UTF8')),'hex'),p_data->'subscription') on conflict(endpoint_hash) do update set user_key=uk,subscription=excluded.subscription,enabled=true,updated_at=now();
 end if;
 if p_action not in ('get','enable','disable') then raise exception 'invalid_action';end if;
 select * into prefs from nz_metrics.reminders where user_key=uk;
 return jsonb_build_object('enabled',coalesce(prefs.enabled,false),'time',coalesce(to_char(prefs.on_time,'HH24:MI'),'09:00'),'timezone',coalesce(prefs.timezone,'Europe/Moscow'),'public_key',(select public_key from nz_private.reminder_config where id));
end $$;
revoke all on function nz_metrics.reminders_api(text,text,jsonb) from public;
grant execute on function nz_metrics.reminders_api(text,text,jsonb) to anon,authenticated;
create function public.nz_reminders(p_token text,p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select nz_metrics.reminders_api(p_token,p_action,p_data)$$;
revoke all on function public.nz_reminders(text,text,jsonb) from public;grant execute on function public.nz_reminders(text,text,jsonb) to anon,authenticated;
create function nz_private.reminder_worker(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare row record; rows jsonb:='[]';kind text;body text;has_today boolean;
begin
 if p_action='auth' then return jsonb_build_object('ok',exists(select 1 from nz_private.reminder_config where job_token=p_data->>'token'));end if;
 if p_action='config' then return (select jsonb_build_object('public_key',public_key,'private_key',private_key) from nz_private.reminder_config where id);end if;
 if p_action='initialize' then
  if p_data->>'public_key' !~ '^[A-Za-z0-9_-]{87}$' or p_data->>'private_key' !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'invalid_keys';end if;
  update nz_private.reminder_config set public_key=p_data->>'public_key',private_key=p_data->>'private_key' where id and public_key is null;
  return nz_private.reminder_worker('config');
 end if;
 if p_action='finish' then
  if p_data->>'status'='sent' then update nz_metrics.reminders set last_sent_at=now() where user_key=p_data->>'user_key';end if;
  if p_data->>'status'='gone' then update nz_metrics.push_devices set enabled=false where id=(p_data->>'id')::uuid;end if;
  return '{"ok":true}';
 end if;
 if p_action<>'claim' then raise exception 'invalid_action';end if;
 for row in
  select r.*,d.id as device_id,d.subscription,t.next_index,t.completed_at from nz_metrics.reminders r
  join lateral(select * from nz_metrics.push_devices where user_key=r.user_key and enabled order by updated_at desc limit 1)d on true
  left join public.nz_trials t on t.user_key=r.user_key
  where r.enabled and r.last_seen_at>now()-interval '14 days' and r.last_seen_at<now()-interval '30 minutes'
   and (now() at time zone r.timezone)::time>=r.on_time and (now() at time zone r.timezone)::time<r.on_time+interval '15 minutes'
   and (r.last_attempt_at is null or (r.last_attempt_at at time zone r.timezone)::date<(now() at time zone r.timezone)::date)
   and (r.last_sent_at is null or r.last_seen_at>now()-interval '3 days' or r.last_sent_at<now()-interval '3 days')
  order by r.last_attempt_at nulls first limit 50 for update of r skip locked
 loop
  has_today:=exists(select 1 from public.nz_results where user_key=row.user_key and day=(now() at time zone row.timezone)::date)
   or exists(select 1 from nz_metrics.reading_results where user_key=row.user_key and (created_at at time zone row.timezone)::date=(now() at time zone row.timezone)::date);
  if has_today then continue;end if;
  kind:='daily';body:='Несколько минут для себя. Начнём зарядку?';
  if row.last_seen_at<now()-interval '3 days' then kind:='return';body:='Начните с одного упражнения — нагрузку можно сократить.';
  elsif row.next_index between 1 and 3 and row.completed_at is null then kind:='continue';body:='Вы прошли '||row.next_index||' из 4 упражнений. Продолжим пробную?';end if;
  update nz_metrics.reminders set last_attempt_at=now() where user_key=row.user_key;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',row.device_id,'user_key',row.user_key,'subscription',row.subscription,'kind',kind,'body',body));
 end loop;
 return rows;
end $$;
revoke all on function nz_private.reminder_worker(text,jsonb) from public,anon,authenticated;
grant execute on function nz_private.reminder_worker(text,jsonb) to service_role;
create function public.nz_reminder_worker(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select nz_private.reminder_worker(p_action,p_data)$$;
revoke all on function public.nz_reminder_worker(text,jsonb) from public,anon,authenticated;grant execute on function public.nz_reminder_worker(text,jsonb) to service_role;
create or replace function nz_metrics.transfer_personalization() returns trigger language plpgsql set search_path='' as $$begin if old.user_key is distinct from new.user_key then update nz_metrics.personalization set user_key=new.user_key where user_key=old.user_key;update nz_metrics.reminders set user_key=new.user_key where user_key=old.user_key;update nz_metrics.push_devices set user_key=new.user_key where user_key=old.user_key;end if;return new;end $$;
create function nz_private.invoke_reminder_job() returns bigint language sql security definer set search_path='' as $$select net.http_post(url:='https://qucwykwlhipjnbeljuvq.supabase.co/functions/v1/neuro-reminders',headers:=jsonb_build_object('Content-Type','application/json','x-job-token',(select job_token from nz_private.reminder_config where id)),body:='{}'::jsonb,timeout_milliseconds:=20000)$$;
revoke all on function nz_private.invoke_reminder_job() from public,anon,authenticated;
