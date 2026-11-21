alter table public.nz_results drop constraint nz_results_ex_check;
alter table public.nz_results add constraint nz_results_ex_check check(ex in ('sch_f','sch_r','dob','mem','colors','percent'));
alter table public.nz_trials drop constraint nz_trials_next_index_check, drop constraint nz_trials_order_version_check;
alter table public.nz_trials add constraint nz_trials_order_version_check check(order_version in (1,2,3)),
  add constraint nz_trials_next_index_check check(next_index between 0 and (case when order_version=3 then 5 else 4 end));

do $migration$
declare d text; old_order text; new_order text;
begin
 d:=pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure);
 old_order:=$old$expected_ex:= (case when trial.order_version=2 then array['sch_f','colors','dob','mem'] else array['sch_f','sch_r','dob','mem'] end)[trial.next_index+1];$old$;
 new_order:=$new$expected_ex:= (case trial.order_version
      when 3 then array['sch_f','colors','dob','mem','percent']
      when 2 then array['sch_f','colors','dob','mem']
      else array['sch_f','sch_r','dob','mem'] end)[trial.next_index+1];$new$;
 if strpos(d,old_order)=0 or strpos(d,'case when p_data->>''order_version''=''2'' then 2 else 1 end')=0
   or strpos(d,'trial.next_index>=4')=0 or strpos(d,'completed_at=case when next_index=3')=0
   or strpos(d,'''completed'',trial.next_index=3')=0 then raise exception 'Unexpected trial definition'; end if;
 d:=replace(d,old_order,new_order);
 d:=replace(d,'case when p_data->>''order_version''=''2'' then 2 else 1 end','case p_data->>''order_version'' when ''3'' then 3 when ''2'' then 2 else 1 end');
 d:=replace(d,'trial.next_index>=4','trial.next_index >= (case when trial.order_version=3 then 5 else 4 end)');
 d:=replace(d,'completed_at=case when next_index=3','completed_at=case when next_index=(case when order_version=3 then 4 else 3 end)');
 d:=replace(d,'''completed'',trial.next_index=3','''completed'',trial.next_index=(case when trial.order_version=3 then 4 else 3 end)');
 execute d;
end $migration$;
