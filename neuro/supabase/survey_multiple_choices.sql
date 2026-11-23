do $migration$ declare src text:=pg_get_functiondef('nz_metrics.personalization_api(text,text,jsonb)'::regprocedure); begin
if strpos(src,$old$(e.value->>'option')::integer as option$old$)=0 then raise exception 'Unexpected function definition';end if;
src:=replace(src,$old$(e.value->>'option')::integer as option$old$,$new$pick.value::integer as option$new$);
if strpos(src,$old$jsonb_each(s.answers) e$old$)=0 then raise exception 'Unexpected function definition';end if;
src:=replace(src,$old$jsonb_each(s.answers) e$old$,$new$jsonb_each(s.answers) e cross join lateral jsonb_array_elements_text(case when jsonb_array_length(coalesce(e.value->'options','[]'))>0 then e.value->'options' else jsonb_build_array(e.value->'option') end) pick(value)$new$);
if strpos(src,$old$group by e.key,e.value->>'option'$old$)=0 then raise exception 'Unexpected function definition';end if;
src:=replace(src,$old$group by e.key,e.value->>'option'$old$,$new$group by e.key,pick.value$new$);
if strpos(src,$old$  update nz_metrics.personalization set answers=$old$)=0 then raise exception 'Unexpected function definition';end if;
src:=replace(src,$old$  update nz_metrics.personalization set answers=$old$,$new$  if p_data ? 'options' then
   if jsonb_typeof(p_data->'options') is distinct from 'array' then raise exception 'invalid_options'; end if;
   if jsonb_array_length(p_data->'options')>5 or exists(select 1 from jsonb_array_elements(p_data->'options') x where jsonb_typeof(x)<>'number' or x::text !~ '^[0-4]$') or (select count(distinct x) from jsonb_array_elements(p_data->'options') x)<>jsonb_array_length(p_data->'options') or coalesce((p_data->'options'->>0)::int,-1)<>choice then raise exception 'invalid_options'; end if;
  end if;
  update nz_metrics.personalization set answers=$new$);
if strpos(src,$old$jsonb_build_object('option',choice,'frequency'$old$)=0 then raise exception 'Unexpected function definition';end if;
src:=replace(src,$old$jsonb_build_object('option',choice,'frequency'$old$,$new$jsonb_build_object('options',coalesce(p_data->'options',case when choice=-1 then '[]'::jsonb else jsonb_build_array(choice) end),'option',choice,'frequency'$new$);
execute src;end $migration$;