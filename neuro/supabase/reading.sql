create table nz_metrics.reading_texts (
  id text primary key,
  words integer not null check (words>0),
  answers jsonb not null check (jsonb_typeof(answers)='array')
);
create table nz_metrics.reading_results (
  id uuid primary key,
  user_key text not null references public.nz_users(key) on delete cascade,
  text_id text not null references nz_metrics.reading_texts(id),
  words integer not null,
  elapsed_ms integer not null,
  wpm integer not null,
  correct integer not null,
  questions integer not null,
  created_at timestamptz not null default now()
);
create index nz_reading_user_time on nz_metrics.reading_results(user_key,created_at desc);
alter table nz_metrics.reading_texts enable row level security;
alter table nz_metrics.reading_results enable row level security;
revoke all on nz_metrics.reading_texts,nz_metrics.reading_results from public,anon,authenticated;
insert into nz_metrics.reading_texts(id,words,answers) values ('garden-v1',257,'[0, 1, 2]'::jsonb);
insert into nz_metrics.reading_texts(id,words,answers) values ('library-v1',283,'[1, 0, 2, 1]'::jsonb);
create function nz_metrics.reading(p_token text,p_action text,p_row jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  profile_key text;
  passage nz_metrics.reading_texts%rowtype;
  saved nz_metrics.reading_results%rowtype;
  duration integer;
  correct_count integer;
  row_id uuid;
begin
  select user_key into profile_key from public.nz_sessions
  where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
  if profile_key is null then raise exception 'unauthorized'; end if;
  if not exists(select 1 from public.nz_subscriptions where user_key=profile_key and paid_until>now())
     and not exists(select 1 from public.nz_family_members m join public.nz_subscriptions s on s.user_key=m.owner_key
       where m.user_key=profile_key and s.plan='family' and s.paid_until>now()) then
    raise exception 'subscription_required';
  end if;
  if p_action='history' then
    return (select coalesce(jsonb_agg(row order by row.created_at desc),'[]'::jsonb)
      from (select * from nz_metrics.reading_results where user_key=profile_key order by created_at desc limit 50) row);
  end if;
  if p_action is distinct from 'save' then raise exception 'invalid_action'; end if;
  if p_row is null or jsonb_typeof(p_row) is distinct from 'object' then raise exception 'invalid_result'; end if;
  row_id := (p_row->>'id')::uuid;
  duration := (p_row->>'elapsed_ms')::integer;
  if row_id is null or duration is null or duration not between 5000 and 1800000 then raise exception 'invalid_duration'; end if;
  select * into passage from nz_metrics.reading_texts where id=p_row->>'text_id';
  if not found then raise exception 'invalid_text'; end if;
  if jsonb_typeof(p_row->'answers') is distinct from 'array' then raise exception 'invalid_answers'; end if;
  if jsonb_array_length(p_row->'answers')<>jsonb_array_length(passage.answers) then raise exception 'invalid_answers'; end if;
  if exists(select 1 from jsonb_array_elements(p_row->'answers') answer
    where jsonb_typeof(answer)<>'number' or (answer#>>'{}') !~ '^[0-2]$') then raise exception 'invalid_answers'; end if;
  select count(*) into correct_count from jsonb_array_elements(p_row->'answers') with ordinality a(answer,n)
    where a.answer=passage.answers->((a.n-1)::integer);
  insert into nz_metrics.reading_results(id,user_key,text_id,words,elapsed_ms,wpm,correct,questions)
  values(row_id,profile_key,passage.id,passage.words,duration,round(passage.words*60000.0/duration)::integer,correct_count,jsonb_array_length(passage.answers))
  on conflict(id) do nothing;
  select * into saved from nz_metrics.reading_results where id=row_id and user_key=profile_key;
  if not found then raise exception 'invalid_result'; end if;
  return to_jsonb(saved);
end $$;
revoke all on function nz_metrics.reading(text,text,jsonb) from public;
grant execute on function nz_metrics.reading(text,text,jsonb) to anon,authenticated;
create function public.nz_reading(p_token text,p_action text,p_row jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$select nz_metrics.reading(p_token,p_action,p_row)$$;
revoke all on function public.nz_reading(text,text,jsonb) from public;
grant execute on function public.nz_reading(text,text,jsonb) to anon,authenticated;
-- Keep reading measurements with the same profile when a paid guest chooses a login.
do $$ declare definition text; begin
  select pg_get_functiondef('nz_metrics.claim_guest(text,text,text,text)'::regprocedure) into definition;
  if strpos(definition,'update nz_metrics.events set user_key=p_key where user_key=oldkey;')=0 then raise exception 'claim signature changed'; end if;
  execute replace(definition,'update nz_metrics.events set user_key=p_key where user_key=oldkey;',
    'update nz_metrics.events set user_key=p_key where user_key=oldkey; update nz_metrics.reading_results set user_key=p_key where user_key=oldkey;');
end $$;
