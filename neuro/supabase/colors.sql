alter table public.nz_results drop constraint nz_results_ex_check;
alter table public.nz_results add constraint nz_results_ex_check check(ex in ('sch_f','sch_r','dob','mem','colors'));
