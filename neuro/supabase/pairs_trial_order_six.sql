alter table public.nz_results drop constraint nz_results_ex_check, add constraint nz_results_ex_check check(ex in ('sch_f','sch_r','dob','mem','colors','percent','market','pairs'));
alter table public.nz_trials drop constraint nz_trials_order_version_check, add constraint nz_trials_order_version_check check(order_version in (1,2,3,4,5,6)), drop constraint nz_trials_next_index_check, add constraint nz_trials_next_index_check check(next_index between 0 and case order_version when 6 then 5 when 5 then 5 when 4 then 6 when 3 then 5 else 4 end);
do $migration$
declare src text := pg_get_functiondef('public.nz_billing_api(text,jsonb)'::regprocedure);
begin
 if strpos(src,$old$when '5' then 5$old$)=0 then raise exception 'unexpected function definition'; end if;
 src:=replace(src,$old$when '5' then 5$old$,$new$when '6' then 6 when '5' then 5$new$);
 if strpos(src,$old$when 5 then 5 when 4$old$)=0 then raise exception 'unexpected function definition'; end if;
 src:=replace(src,$old$when 5 then 5 when 4$old$,$new$when 6 then 5 when 5 then 5 when 4$new$);
 if strpos(src,$old$when 5 then array['sch_f'$old$)=0 then raise exception 'unexpected function definition'; end if;
 src:=replace(src,$old$when 5 then array['sch_f'$old$,$new$when 6 then array['sch_f','colors','market','dob','pairs'] when 5 then array['sch_f'$new$);
 if strpos(src,$old$when 5 then 4 when 4$old$)=0 then raise exception 'unexpected function definition'; end if;
 src:=replace(src,$old$when 5 then 4 when 4$old$,$new$when 6 then 4 when 5 then 4 when 4$new$);
 execute src;
end $migration$;
do $migration$
declare src text := pg_get_functiondef('nz_metrics.personalization_api(text,text,jsonb)'::regprocedure);
begin
 if strpos(src,$old$not between 1 and 4 or exists$old$)=0 then raise exception 'unexpected function definition'; end if;
 src:=replace(src,$old$not between 1 and 4 or exists$old$,$new$not between 1 and 5 or exists$new$);
 if strpos(src,$old$v not in ('sch_f','sch_r','dob','mem')$old$)=0 then raise exception 'unexpected function definition'; end if;
 src:=replace(src,$old$v not in ('sch_f','sch_r','dob','mem')$old$,$new$v not in ('sch_f','sch_r','dob','mem','pairs')$new$);
 execute src;
end $migration$;
