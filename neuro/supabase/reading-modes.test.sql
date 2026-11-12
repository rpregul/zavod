begin;
do $$
declare
  suffix text := replace(gen_random_uuid()::text,'-','');
  user_a text; user_b text; user_c text;
  token_a text := gen_random_uuid()::text;
  token_b text := gen_random_uuid()::text;
  token_c text := gen_random_uuid()::text;
  result_a jsonb;
  result_b jsonb;
  payload jsonb := jsonb_build_object('id',gen_random_uuid(),'text_id','garden-v1','elapsed_ms',60000,'answers',jsonb_build_array(0,1,2));
begin
  user_a := '__qa_read_a_'||suffix;
  user_b := '__qa_read_b_'||suffix;
  user_c := '__qa_read_c_'||suffix;
  insert into public.nz_users(key,name,hash) values(user_a,user_a,repeat('a',64)),(user_b,user_b,repeat('a',64)),(user_c,user_c,repeat('a',64));
  insert into public.nz_sessions(user_key,token_hash) values
    (user_a,encode(sha256(convert_to(token_a,'UTF8')),'hex')),
    (user_b,encode(sha256(convert_to(token_b,'UTF8')),'hex')),
    (user_c,encode(sha256(convert_to(token_c,'UTF8')),'hex'));
  insert into public.nz_subscriptions(user_key,plan,paid_until) values(user_a,'family',now()+interval '1 day');
  insert into public.nz_family_members(user_key,owner_key) values(user_b,user_a);
  set local role anon;
  result_a := public.nz_reading(token_a,'save',payload);
  assert (result_a->>'wpm')::int=257 and (result_a->>'correct')::int=3,'calculation mismatch';
  result_b := public.nz_reading(token_a,'save',payload);
  assert result_a=result_b,'retry changed result';
  assert jsonb_array_length(public.nz_reading(token_a,'history'))=1,'duplicate result';
  assert jsonb_array_length(public.nz_reading(token_b,'history'))=0,'history leaked between profiles';
  perform public.nz_reading(token_b,'save',payload||jsonb_build_object('id',gen_random_uuid(),'elapsed_ms',120000,'answers',jsonb_build_array(2,1,0)));
  assert jsonb_array_length(public.nz_reading(token_b,'history'))=1,'family access denied';
  begin
    perform public.nz_reading(token_c,'history');
    raise exception 'unpaid access accepted';
  exception when others then if sqlerrm<>'subscription_required' then raise; end if; end;
  begin
    perform public.nz_reading('invalid','history');
    raise exception 'invalid token accepted';
  exception when others then if sqlerrm<>'unauthorized' then raise; end if; end;
  begin
    perform public.nz_reading(token_a,'save',payload||jsonb_build_object('elapsed_ms',0));
    raise exception 'invalid duration accepted';
  exception when others then if sqlerrm<>'invalid_duration' then raise; end if; end;
  assert not has_table_privilege('anon','nz_metrics.reading_results','select');
  assert not has_table_privilege('anon','nz_metrics.reading_results','insert');
  assert jsonb_array_length(public.nz_reading(token_a,'history',jsonb_build_object('mode','legacy')))=1;
  perform public.nz_reading(token_a,'save',payload||jsonb_build_object('id',gen_random_uuid(),'mode','aloud'));
  perform public.nz_reading(token_a,'save',payload||jsonb_build_object('id',gen_random_uuid(),'mode','silent'));
  assert jsonb_array_length(public.nz_reading(token_a,'history',jsonb_build_object('mode','aloud')))=1,'aloud history mixed';
  assert jsonb_array_length(public.nz_reading(token_a,'history',jsonb_build_object('mode','silent')))=1,'silent history mixed';
  assert jsonb_array_length(public.nz_reading(token_a,'history',jsonb_build_object('mode','legacy')))=1,'legacy history changed';
  assert jsonb_array_length(public.nz_reading(token_a,'history'))=3,'unfiltered compatibility failed';
  begin
    perform public.nz_reading(token_a,'save',payload||jsonb_build_object('mode','aloud'));
    raise exception 'existing mode was changed';
  exception when others then if sqlerrm<>'invalid_result_mode' then raise; end if; end;
  begin
    perform public.nz_reading(token_a,'save',payload||jsonb_build_object('id',gen_random_uuid(),'mode','invalid'));
    raise exception 'invalid mode accepted';
  exception when others then if sqlerrm<>'invalid_mode' then raise; end if; end;
  reset role;
end $$;
select 'PASS distinct aloud/silent histories, preserved legacy records, immutable mode on retry, access and comprehension' result;
rollback;
