create function nz_metrics.transfer_personalization() returns trigger language plpgsql set search_path='' as $$ begin if old.user_key is distinct from new.user_key then update nz_metrics.personalization set user_key=new.user_key where user_key=old.user_key; end if; return new; end $$;
revoke all on function nz_metrics.transfer_personalization() from public,anon,authenticated;
create trigger nz_transfer_personalization after update of user_key on public.nz_subscriptions for each row execute function nz_metrics.transfer_personalization();
