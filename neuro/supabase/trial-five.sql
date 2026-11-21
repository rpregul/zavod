alter table public.nz_trials drop constraint nz_trials_order_version_check,
  drop constraint nz_trials_next_index_check,
  add constraint nz_trials_order_version_check check(order_version in (1,2,3,4,5)),
  add constraint nz_trials_next_index_check check(next_index between 0 and
    (case order_version when 5 then 5 when 4 then 6 when 3 then 5 else 4 end));
do $migration$
declare
  d text := pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure);
  fragment text[];
begin
  foreach fragment slice 1 in array array[
    ['case p_data->>''order_version'' when ''4'' then 4','case p_data->>''order_version'' when ''5'' then 5 when ''4'' then 4'],
    ['case trial.order_version when 4 then 6','case trial.order_version when 5 then 5 when 4 then 6'],
    ['case trial.order_version when 4 then 5','case trial.order_version when 5 then 4 when 4 then 5'],
    ['case order_version when 4 then 5','case order_version when 5 then 4 when 4 then 5'],
    ['when 4 then array[''sch_f''','when 5 then array[''sch_f'',''colors'',''market'',''dob'',''mem''] when 4 then array[''sch_f''']
  ] loop
    if strpos(d,fragment[1])=0 then raise exception 'Unexpected previous trial definition'; end if;
    d := replace(d,fragment[1],fragment[2]);
  end loop;
  execute d;
end;
$migration$;
