begin;
do $$
declare base text:='__qa_push_'||replace(gen_random_uuid()::text,'-',''); uk text; token text:=gen_random_uuid()::text; other_token text:=gen_random_uuid()::text; data jsonb; claimed jsonb; payload jsonb; name text; r record;
begin
 for name in select unnest(array['daily','done','paused','return','cooldown','partial']) loop
  uk:=base||name;insert into public.nz_users(key,name,hash) values(uk,uk,repeat('a',64));
  insert into nz_metrics.reminders(user_key,on_time,timezone,enabled,last_seen_at,last_sent_at)
  values(uk,(now() at time zone 'UTC')::time-interval '1 minute','UTC',true,case when name='paused' then now()-interval '15 days' when name in ('return','cooldown') then now()-interval '4 days' else now()-interval '1 hour' end,case when name='cooldown' then now()-interval '2 days' else null end);
  insert into nz_metrics.push_devices(user_key,endpoint_hash,subscription) values(uk,uk,jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/'||uk,'keys',jsonb_build_object('p256dh',repeat('a',87),'auth',repeat('a',22))));
 end loop;
 insert into public.nz_results(id,user_key,ex,score,day,ts) values(gen_random_uuid(),base||'done','sch_f',10,(now() at time zone 'UTC')::date,1);
 insert into public.nz_trials(user_key,next_index) values(base||'partial',2);
 claimed:=nz_private.reminder_worker('claim');
 assert (select count(*) from jsonb_array_elements(claimed) v where v->>'user_key' like base||'%')=3,'activity suppression mismatch';
 assert exists(select 1 from jsonb_array_elements(claimed) v where v->>'user_key'=base||'return' and v->>'kind'='return');
 assert exists(select 1 from jsonb_array_elements(claimed) v where v->>'user_key'=base||'partial' and v->>'kind'='continue');
 claimed:=nz_private.reminder_worker('claim');assert not exists(select 1 from jsonb_array_elements(claimed) v where v->>'user_key' like base||'%'),'duplicate claim';
 insert into public.nz_sessions(user_key,token_hash) values(base||'daily',encode(sha256(convert_to(token,'UTF8')),'hex')),(base||'done',encode(sha256(convert_to(other_token,'UTF8')),'hex'));
 set local role anon;
 data:=public.nz_reminders(token,'get');assert data->>'enabled'='true';assert not data ? 'private_key';assert not data ? 'job_token';assert not data ? 'subscription';
 payload:=jsonb_build_object('consent',true,'time','09:00','timezone','Europe/Moscow','subscription',jsonb_build_object('endpoint','https://127.0.0.1/private','keys',jsonb_build_object('p256dh',repeat('a',87),'auth',repeat('a',22))));
 begin perform public.nz_reminders(token,'enable',payload);raise exception 'private endpoint accepted';exception when others then if sqlerrm<>'invalid_endpoint' then raise;end if;end;
 begin perform public.nz_reminders(token,'enable',payload||'{"time":"02:00"}');raise exception 'night time accepted';exception when others then if sqlerrm<>'quiet_hours' then raise;end if;end;
 perform public.nz_reminders(token,'disable');assert public.nz_reminders(token,'get')->>'enabled'='false';assert public.nz_reminders(other_token,'get')->>'enabled'='true','cross-profile modification';
 begin perform public.nz_reminder_worker('config');raise exception 'worker secrets accessible';exception when insufficient_privilege then null;end;
 assert not has_table_privilege('anon','nz_metrics.push_devices','select');begin perform 1 from nz_private.reminder_config;raise exception 'secret table accessible';exception when insufficient_privilege then null;end;
 reset role;
end $$;
select 'PASS activity suppression, pause/cooldown, once per day, partial workout, privacy, endpoint validation and opt-out; rollback' result;
rollback;
