alter table nz_metrics.personalization add column exercises text[];
create or replace function nz_metrics.personalization_api(p_token text,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uk text; chosen_ex text; choice integer; frequency integer; baseline public.nz_results%rowtype; percent_value integer; target_value integer; profile nz_metrics.personalization%rowtype;
begin
 select user_key into uk from public.nz_sessions where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now();
 if uk is null then raise exception 'unauthorized'; end if;
 if p_action='report' then
  if uk is distinct from 'рома' then raise exception 'forbidden'; end if;
  return jsonb_build_object('profiles',(select count(*) from nz_metrics.personalization where user_key<>'рома' and left(user_key,2)<>'__'),
   'goals',(select count(*) from nz_metrics.personalization where goal is not null and user_key<>'рома' and left(user_key,2)<>'__'),
   'answers',coalesce((select jsonb_agg(to_jsonb(a)) from (
    select e.key as ex,(e.value->>'option')::integer as option,count(*) as count,
    round(avg((e.value->>'frequency')::numeric),1) as frequency,
    count(*) filter(where t.completed_at is not null) as completed,
    count(*) filter(where exists(select 1 from public.nz_payments p where p.user_key=s.user_key and p.state='succeeded' and not p.is_test and p.kind='checkout')) as buyers
    from nz_metrics.personalization s cross join lateral jsonb_each(s.answers) e
    left join public.nz_trials t on t.user_key=s.user_key
    where s.user_key<>'рома' and left(s.user_key,2)<>'__'
    group by e.key,e.value->>'option'
   ) a),'[]'::jsonb));
 end if;
 if p_action='get' then
  select * into profile from nz_metrics.personalization where user_key=uk;
  return jsonb_build_object('answers',coalesce(profile.answers,'{}'::jsonb),'goal',profile.goal,'exercises',profile.exercises);
 end if;
 if p_action not in ('answer','goal','routine') then raise exception 'invalid_action'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'invalid_data'; end if;
 if p_action='routine' then
  if jsonb_typeof(p_data->'exercises') is distinct from 'array' then raise exception 'invalid_routine'; end if;
  if jsonb_array_length(p_data->'exercises') not between 1 and 4 or exists(select 1 from jsonb_array_elements_text(p_data->'exercises') v where v not in ('sch_f','sch_r','dob','mem')) or (select count(distinct v) from jsonb_array_elements_text(p_data->'exercises') v)<>jsonb_array_length(p_data->'exercises') then raise exception 'invalid_routine'; end if;
  insert into nz_metrics.personalization(user_key) values(uk) on conflict do nothing;
  update nz_metrics.personalization set exercises=array(select jsonb_array_elements_text(p_data->'exercises')),updated_at=now() where user_key=uk;
  return nz_metrics.personalization_api(p_token,'get','{}');
 end if;
 chosen_ex:=p_data->>'ex';
 if chosen_ex is null or chosen_ex not in ('sch_f','sch_r','dob','mem') then raise exception 'invalid_exercise'; end if;
 insert into nz_metrics.personalization(user_key) values(uk) on conflict do nothing;
 select * into profile from nz_metrics.personalization where user_key=uk for update;
 if p_action='answer' then
  choice:=(p_data->>'option')::integer; frequency:=(p_data->>'frequency')::integer;
  if choice is null or choice not between -1 and 4 or (frequency is not null and frequency not between 0 and 3) then raise exception 'invalid_answer'; end if;
  update nz_metrics.personalization set answers=answers||jsonb_build_object(chosen_ex,jsonb_build_object('option',choice,'frequency',case when choice=-1 then null else frequency end)),updated_at=now() where user_key=uk;
 else
  select * into baseline from public.nz_results where user_key=uk and nz_results.ex=chosen_ex order by ts,id limit 1;
  if baseline.id is null then raise exception 'result_required'; end if;
  percent_value:=(p_data->>'percent')::integer;
  if baseline.score>0 then
   if percent_value is null or percent_value not between 1 and 100 then raise exception 'invalid_goal'; end if;
   target_value:=ceil(baseline.score*(1+percent_value/100.0));
  else
   target_value:=(p_data->>'target')::integer; percent_value:=null;
   if target_value is null or target_value not between 1 and 1000 then raise exception 'invalid_goal'; end if;
  end if;
  update nz_metrics.personalization set goal=jsonb_build_object('ex',chosen_ex,'baseline',baseline.score,'baseline_id',baseline.id,'baseline_day',baseline.day,'percent',percent_value,'target',target_value),updated_at=now() where user_key=uk;
 end if;
 select * into profile from nz_metrics.personalization where user_key=uk;
 return jsonb_build_object('answers',profile.answers,'goal',profile.goal,'exercises',profile.exercises);
end $$;
