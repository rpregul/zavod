CREATE OR REPLACE FUNCTION nz_metrics.reading(p_token text, p_action text, p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  profile_key text;
  passage nz_metrics.reading_texts%rowtype;
  saved nz_metrics.reading_results%rowtype;
  duration integer;
  correct_count integer;
  row_id uuid;
  result_mode text;
  mode_filter text;
  entitled boolean;
begin
  select user_key into profile_key from public.nz_sessions
  where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
  if profile_key is null then raise exception 'unauthorized'; end if;
  entitled := exists(select 1 from public.nz_subscriptions where user_key=profile_key and paid_until>now())
    or exists(select 1 from public.nz_family_members m join public.nz_subscriptions sub on sub.user_key=m.owner_key where m.user_key=profile_key and sub.plan='family' and sub.paid_until>now());
  if p_action='status' then
    return jsonb_build_object('active',entitled,'free_available',jsonb_build_object(
      'aloud',not exists(select 1 from nz_metrics.reading_results where user_key=profile_key and mode='aloud'),
      'silent',not exists(select 1 from nz_metrics.reading_results where user_key=profile_key and mode='silent')));
  end if;
  if p_action='history' then
    mode_filter := p_row->>'mode';
    if mode_filter is not null and mode_filter not in ('aloud','silent','legacy') then raise exception 'invalid_mode'; end if;
    return (select coalesce(jsonb_agg(row order by row.created_at desc),'[]'::jsonb)
      from (select * from nz_metrics.reading_results where user_key=profile_key
        and (mode_filter is null or mode=mode_filter or (mode_filter='legacy' and mode is null))
        order by created_at desc limit 50) row);
  end if;
  if p_action is distinct from 'save' then raise exception 'invalid_action'; end if;
  if p_row is null or jsonb_typeof(p_row) is distinct from 'object' then raise exception 'invalid_result'; end if;
  result_mode := p_row->>'mode';
  if result_mode is not null and result_mode not in ('aloud','silent') then raise exception 'invalid_mode'; end if;
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
  -- Serialize saves per profile: simultaneous requests cannot consume the same free mode twice.
  perform 1 from public.nz_users where key=profile_key for update;
  if not found then raise exception 'unauthorized'; end if;
  select * into saved from nz_metrics.reading_results where id=row_id and user_key=profile_key;
  if found then
    if saved.mode is distinct from result_mode then raise exception 'invalid_result_mode'; end if;
    return to_jsonb(saved);
  end if;
  if not entitled then
    if result_mode is null then raise exception 'invalid_mode'; end if;
    if exists(select 1 from nz_metrics.reading_results where user_key=profile_key and mode=result_mode) then raise exception 'subscription_required'; end if;
  end if;
  insert into nz_metrics.reading_results(id,user_key,text_id,words,elapsed_ms,wpm,correct,questions,mode)
  values(row_id,profile_key,passage.id,passage.words,duration,round(passage.words*60000.0/duration)::integer,correct_count,jsonb_array_length(passage.answers),result_mode)
  on conflict(id) do nothing;
  select * into saved from nz_metrics.reading_results where id=row_id and user_key=profile_key;
  if not found then raise exception 'invalid_result'; end if;
  if saved.mode is distinct from result_mode then raise exception 'invalid_result_mode'; end if;
  return to_jsonb(saved);
end $function$

