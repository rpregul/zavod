-- Extend the paid catalogue and add a trial sequence for new participants.
-- Existing trials keep their stored order version and completion state.
alter table public.nz_results drop constraint nz_results_ex_check,
  add constraint nz_results_ex_check check (ex in ('sch_f','sch_r','dob','mem','colors','percent','market'));

alter table public.nz_trials drop constraint nz_trials_order_version_check,
  drop constraint nz_trials_next_index_check,
  add constraint nz_trials_order_version_check check (order_version in (1,2,3,4)),
  add constraint nz_trials_next_index_check check (next_index between 0 and
    (case order_version when 4 then 6 when 3 then 5 else 4 end));

do $migration$
declare
  definition text := pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure);
  old_order text := $order$when 3 then array['sch_f','colors','dob','mem','percent']$order$;
begin
  if strpos(definition, 'case p_data->>''order_version'' when ''3'' then 3 when ''2'' then 2 else 1 end') = 0
    or strpos(definition, 'case when trial.order_version=3 then 5 else 4 end') = 0
    or strpos(definition, 'case when order_version=3 then 4 else 3 end') = 0
    or strpos(definition, 'case when trial.order_version=3 then 4 else 3 end') = 0
    or strpos(definition, old_order) = 0
  then
    raise exception 'Expected trial version 3 billing definition';
  end if;

  definition := replace(definition, 'case p_data->>''order_version'' when ''3'' then 3 when ''2'' then 2 else 1 end',
    'case p_data->>''order_version'' when ''4'' then 4 when ''3'' then 3 when ''2'' then 2 else 1 end');
  definition := replace(definition, 'case when trial.order_version=3 then 5 else 4 end',
    'case trial.order_version when 4 then 6 when 3 then 5 else 4 end');
  definition := replace(definition, 'case when order_version=3 then 4 else 3 end',
    'case order_version when 4 then 5 when 3 then 4 else 3 end');
  definition := replace(definition, 'case when trial.order_version=3 then 4 else 3 end',
    'case trial.order_version when 4 then 5 when 3 then 4 else 3 end');
  definition := replace(definition, old_order,
    $order$when 4 then array['sch_f','colors','dob','mem','percent','market']
      $order$ || old_order);
  execute definition;
end;
$migration$;
