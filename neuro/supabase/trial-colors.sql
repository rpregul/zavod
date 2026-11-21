-- Existing trials keep their exercise order. New clients request version 2.
alter table public.nz_trials add column if not exists order_version smallint not null default 1 check (order_version in (1,2));
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure);
  if strpos(definition, 'insert into public.nz_trials(user_key) values(uk) on conflict do nothing;') = 0
    or strpos(definition, '''trial_id'',trial.id,''next_index'',trial.next_index);') = 0
    or strpos(definition, 'expected_ex:=(array[''sch_f'',''sch_r'',''dob'',''mem''])[trial.next_index+1];') = 0
  then raise exception 'Unexpected trial function definition'; end if;
  definition := replace(definition, 'insert into public.nz_trials(user_key) values(uk) on conflict do nothing;',
    'insert into public.nz_trials(user_key,order_version) values(uk,case when p_data->>''order_version''=''2'' then 2 else 1 end) on conflict do nothing;');
  definition := replace(definition, '''trial_id'',trial.id,''next_index'',trial.next_index);',
    '''trial_id'',trial.id,''next_index'',trial.next_index,''order_version'',trial.order_version);');
  definition := replace(definition, 'expected_ex:=(array[''sch_f'',''sch_r'',''dob'',''mem''])[trial.next_index+1];',
    'expected_ex:= (case when trial.order_version=2 then array[''sch_f'',''colors'',''dob'',''mem''] else array[''sch_f'',''sch_r'',''dob'',''mem''] end)[trial.next_index+1];');
  execute definition;

  definition := pg_get_functiondef('nz_metrics.personalization_api(text,text,jsonb)'::regprocedure);
  if strpos(definition, 'chosen_ex not in (''sch_f'',''sch_r'',''dob'',''mem'')') = 0
  then raise exception 'Unexpected personalization function definition'; end if;
  definition := replace(definition, 'chosen_ex not in (''sch_f'',''sch_r'',''dob'',''mem'')',
    'chosen_ex not in (''sch_f'',''sch_r'',''dob'',''mem'',''colors'')');
  execute definition;
end $migration$;
