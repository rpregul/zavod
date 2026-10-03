-- Нейро-зарядка: общая база для одногруппников (Supabase / Postgres).
-- Прямого доступа к таблицам у браузера нет (RLS включён, политик нет).
-- Всё идёт через 4 функции ниже; PIN нигде не хранится в открытом виде (только SHA-256 от имя:PIN).

create table if not exists nz_users (
  key          text primary key,           -- имя в нижнем регистре
  name         text not null,              -- как написал человек
  hash         text not null,              -- sha256(key:pin:nz1)
  fails        int  not null default 0,
  locked_until timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists nz_results (
  id         uuid primary key,
  user_key   text not null references nz_users(key) on delete cascade,
  ex         text not null check (ex in ('sch_f','sch_r','dob','mem')),
  score      int  not null check (score between 0 and 1000),
  day        date not null,
  ts         bigint not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists nz_results_user_idx on nz_results (user_key, ts);

alter table nz_users   enable row level security;
alter table nz_results enable row level security;

-- проверка PIN с защитой от подбора: 10 ошибок = блокировка на 10 минут
create or replace function nz_check(p_key text, p_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare u nz_users%rowtype;
begin
  select * into u from nz_users where key = p_key for update;
  if not found then return 'no_user'; end if;
  if u.locked_until is not null and u.locked_until > now() then return 'locked'; end if;
  if u.hash = p_hash then
    if u.fails > 0 or u.locked_until is not null then
      update nz_users set fails = 0, locked_until = null where key = p_key;
    end if;
    return 'ok';
  end if;
  update nz_users
     set fails = case when fails + 1 >= 10 then 0 else fails + 1 end,
         locked_until = case when fails + 1 >= 10 then now() + interval '10 minutes' else null end
   where key = p_key;
  return 'bad_pin';
end $$;

create or replace function nz_login(p_key text, p_name text, p_hash text, p_create boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if coalesce(length(p_key), 0) not between 1 and 40 or coalesce(length(p_hash), 0) <> 64 then
    return jsonb_build_object('status', 'invalid');
  end if;
  st := nz_check(p_key, p_hash);
  if st = 'no_user' then
    if not p_create then return jsonb_build_object('status', 'no_user'); end if;
    insert into nz_users (key, name, hash) values (p_key, left(coalesce(p_name, p_key), 40), p_hash)
      on conflict (key) do nothing;
    st := nz_check(p_key, p_hash);
    if st = 'ok' then
      return jsonb_build_object('status', 'created', 'name', (select name from nz_users where key = p_key));
    end if;
  end if;
  return jsonb_build_object('status', st, 'name', (select name from nz_users where key = p_key));
end $$;

create or replace function nz_push(p_key text, p_hash text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st text;
begin
  st := nz_check(p_key, p_hash);
  if st <> 'ok' then return jsonb_build_object('status', st); end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into nz_results (id, user_key, ex, score, day, ts, meta)
  select (r->>'id')::uuid, p_key, r->>'ex', (r->>'score')::int, (r->>'day')::date,
         (r->>'ts')::bigint, coalesce(r->'meta', '{}'::jsonb)
    from jsonb_array_elements(p_rows) r
  on conflict (id) do nothing;
  return jsonb_build_object('status', 'ok');
end $$;

create or replace function nz_pull(p_key text, p_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st text; rows jsonb;
begin
  st := nz_check(p_key, p_hash);
  if st <> 'ok' then return jsonb_build_object('status', st); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'ex', ex, 'score', score, 'day', to_char(day, 'YYYY-MM-DD'), 'ts', ts, 'meta', meta
         ) order by ts), '[]'::jsonb)
    into rows from nz_results where user_key = p_key;
  return jsonb_build_object('status', 'ok', 'rows', rows);
end $$;

revoke all on function nz_check(text, text) from public, anon, authenticated;
revoke all on function nz_login(text, text, text, boolean) from public;
revoke all on function nz_push(text, text, jsonb) from public;
revoke all on function nz_pull(text, text) from public;
grant execute on function nz_login(text, text, text, boolean) to anon, authenticated;
grant execute on function nz_push(text, text, jsonb) to anon, authenticated;
grant execute on function nz_pull(text, text) to anon, authenticated;
