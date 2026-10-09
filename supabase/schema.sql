-- 정보처리기사 실기 개인 학습 앱 — Supabase 스키마 (여러 번 실행해도 안전하도록 작성)
-- 원칙: 학습 기록은 본인만, 원본·출처·자료 변경은 관리자만. 익명 접근 불가.
begin;

create table if not exists public.allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.allowed_users enable row level security;
alter table public.allowed_users add column if not exists role text not null default 'student' check (role in ('admin', 'student'));
-- 정책 없음 → 클라이언트에서 읽기/쓰기 불가 (아래 security definer 함수로만 확인)

create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where user_id = auth.uid());
$$;
revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where user_id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 아이디→계정 대응은 서버만 읽는다. 이메일 조회용 공개 RPC를 만들지 않는다.
create table if not exists public.login_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$')
);
alter table public.login_profiles enable row level security;
revoke all on public.login_profiles from anon, authenticated;
grant all on public.login_profiles to service_role;

create table if not exists public.login_attempts (
  username text primary key,
  started_at timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;
create index if not exists login_attempts_started on public.login_attempts(started_at);
create or replace function public.take_login_slot(p_username text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_username is null or p_username !~ '^[a-z0-9_]{3,30}$' then return false; end if;
  delete from public.login_attempts where started_at < now() - interval '1 day';
  insert into public.login_attempts(username) values (p_username)
  on conflict (username) do update set
    attempts = case when login_attempts.started_at < now() - interval '1 minute' then 1 else least(login_attempts.attempts + 1, 11) end,
    started_at = case when login_attempts.started_at < now() - interval '1 minute' then now() else login_attempts.started_at end
  returning attempts into n;
  return n <= 10;
end $$;
revoke all on function public.take_login_slot(text) from public, anon, authenticated;
grant execute on function public.take_login_slot(text) to service_role;

-- 학습 이벤트(추가 전용): 시도·힌트·오답 원인·개념 확인 등. 클라이언트가 만든 UUID로 중복 제출 방지.
create table if not exists public.events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('attempt','cause','concept_read','concept_check','recall','flag','note')),
  item_id text not null,
  data jsonb not null default '{}'::jsonb,
  client_at timestamptz,
  created_at timestamptz not null default now(),
  device text,
  content_version text
);
create index if not exists events_user_created on public.events(user_id, created_at);
alter table public.events enable row level security;
drop policy if exists events_select on public.events;
drop policy if exists events_insert on public.events;
create policy events_select on public.events for select to authenticated using (user_id = auth.uid() and public.is_allowed());
create policy events_insert on public.events for insert to authenticated with check (user_id = auth.uid() and public.is_allowed());
-- update/delete 정책 없음 → 기록은 수정·삭제되지 않음(추가 전용)

-- 키-값 상태(작성 중 답안, 마지막 위치, 설정 등): 버전 기반 낙관적 동시성 제어
create table if not exists public.kv (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  device text,
  primary key (user_id, key)
);
alter table public.kv enable row level security;
drop policy if exists kv_select on public.kv;
drop policy if exists kv_delete on public.kv;
create policy kv_select on public.kv for select to authenticated using (user_id = auth.uid() and public.is_allowed());
create policy kv_delete on public.kv for delete to authenticated using (user_id = auth.uid() and public.is_allowed());
-- insert/update는 kv_put 함수로만

create or replace function public.kv_put(p_key text, p_value jsonb, p_expected bigint, p_device text)
returns table(ok boolean, version bigint, value jsonb, updated_at timestamptz, device text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := auth.uid(); r public.kv%rowtype;
begin
  if uid is null or not public.is_allowed() then raise exception 'not allowed'; end if;
  if coalesce(p_expected, 0) = 0 then
    insert into public.kv(user_id, key, value, version, device) values (uid, p_key, p_value, 1, p_device)
      on conflict (user_id, key) do nothing returning * into r;
  else
    update public.kv k set value = p_value, version = k.version + 1, updated_at = now(), device = p_device
      where k.user_id = uid and k.key = p_key and k.version = p_expected returning * into r;
  end if;
  if r.key is not null then
    return query select true, r.version, r.value, r.updated_at, r.device; return;
  end if;
  -- 충돌: 현재 서버 값을 돌려준다(클라이언트가 사용자에게 선택하게 함)
  return query select false, k.version, k.value, k.updated_at, k.device from public.kv k where k.user_id = uid and k.key = p_key;
end $$;
revoke all on function public.kv_put(text, jsonb, bigint, text) from public, anon;
grant execute on function public.kv_put(text, jsonb, bigint, text) to authenticated;

-- 비공개 Storage 버킷: 콘텐츠 번들, 문제 원문 이미지, 원본 PDF
insert into storage.buckets (id, name, public, file_size_limit)
values ('private', 'private', false, 52428800)
on conflict (id) do update set public = false;

drop policy if exists private_read on storage.objects;
drop policy if exists private_insert on storage.objects;
drop policy if exists private_update on storage.objects;
drop policy if exists private_delete on storage.objects;
-- 문제 이미지에도 제공자·페이지 정보가 있어 관리자만 읽는다.
create policy private_read on storage.objects for select to authenticated using (
  bucket_id = 'private' and public.is_allowed() and (
    public.is_admin() or name in ('content/student.json', 'content/meta.json')
  )
);
create policy private_insert on storage.objects for insert to authenticated with check (bucket_id = 'private' and public.is_admin());
create policy private_update on storage.objects for update to authenticated using (bucket_id = 'private' and public.is_admin()) with check (bucket_id = 'private' and public.is_admin());
create policy private_delete on storage.objects for delete to authenticated using (bucket_id = 'private' and public.is_admin());

-- ===== 관리자 현황·피드백·접근 차단 (admin_feedback.sql과 동일) =====

alter table public.allowed_users add column if not exists disabled boolean not null default false;

create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where user_id = auth.uid() and not disabled);
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where user_id = auth.uid() and role = 'admin' and not disabled);
$$;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('error', 'content', 'feature', 'other')),
  message text not null check (char_length(message) between 1 and 2000),
  context text check (char_length(context) <= 300),
  device text check (char_length(device) <= 60),
  app_version text check (char_length(app_version) <= 30),
  content_version text check (char_length(content_version) <= 40),
  status text not null default 'new' check (status in ('new', 'read', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_created on public.feedback(created_at desc);
create index if not exists feedback_user on public.feedback(user_id, created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback for select to authenticated using (user_id = auth.uid() and public.is_allowed());
-- 쓰기는 아래 함수로만(직접 insert/update/delete 불가)

create or replace function public.submit_feedback(p_category text, p_message text, p_context text, p_device text, p_app_version text, p_content_version text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid;
begin
  if uid is null or not public.is_allowed() then raise exception 'not allowed'; end if;
  if (select count(*) from public.feedback where user_id = uid and created_at > now() - interval '1 day') >= 20 then raise exception 'too many feedback'; end if;
  insert into public.feedback(user_id, category, message, context, device, app_version, content_version)
  values (uid, p_category, btrim(p_message), nullif(left(p_context, 300), ''), left(p_device, 60), left(p_app_version, 30), left(p_content_version, 40))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.submit_feedback(text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_feedback(text, text, text, text, text, text) to authenticated;

create or replace function public.admin_feedback_list()
returns table(id uuid, username text, category text, message text, context text, device text, app_version text, content_version text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
    select f.id, coalesce(lp.username, '(알 수 없음)'), f.category, f.message, f.context, f.device, f.app_version, f.content_version, f.status, f.created_at
    from public.feedback f left join public.login_profiles lp on lp.user_id = f.user_id
    order by f.created_at desc limit 500;
end $$;
revoke all on function public.admin_feedback_list() from public, anon;
grant execute on function public.admin_feedback_list() to authenticated;

create or replace function public.admin_set_feedback_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_status not in ('new', 'read', 'done') then raise exception 'bad status'; end if;
  update public.feedback set status = p_status where id = p_id;
end $$;
revoke all on function public.admin_set_feedback_status(uuid, text) from public, anon;
grant execute on function public.admin_set_feedback_status(uuid, text) to authenticated;

-- 사용자 현황: 계정 정보와 학습 기록의 '요약 숫자'만 돌려준다(답안 내용·필기는 보지 않는다).
create or replace function public.admin_user_overview()
returns table(user_id uuid, username text, role text, disabled boolean, created_at timestamptz, last_sign_in_at timestamptz,
  attempts bigint, correct bigint, problems_tried bigint, concepts_read bigint, exam_runs bigint, last_activity timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
    select au.user_id, coalesce(lp.username, split_part(u.email, '@', 1)), au.role, au.disabled, u.created_at, u.last_sign_in_at,
      coalesce(e.attempts, 0), coalesce(e.correct, 0), coalesce(e.tried, 0), coalesce(e.concepts, 0), coalesce(e.exams, 0), e.last_activity
    from public.allowed_users au
    join auth.users u on u.id = au.user_id
    left join public.login_profiles lp on lp.user_id = au.user_id
    left join lateral (
      select count(*) filter (where ev.type = 'attempt' and ev.data->>'result' <> 'revealed') as attempts,
        count(*) filter (where ev.type = 'attempt' and ev.data->>'result' in ('correct', 'self_correct')) as correct,
        count(distinct ev.item_id) filter (where ev.type = 'attempt' and ev.data->>'result' <> 'revealed') as tried,
        count(distinct ev.item_id) filter (where ev.type = 'concept_read') as concepts,
        count(distinct ev.data->>'run') filter (where ev.type = 'attempt' and ev.data->>'mode' = 'exam') as exams,
        max(coalesce(ev.client_at, ev.created_at)) as last_activity
      from public.events ev where ev.user_id = au.user_id
    ) e on true
    order by (au.role = 'admin') desc, e.last_activity desc nulls last, u.created_at;
end $$;
revoke all on function public.admin_user_overview() from public, anon;
grant execute on function public.admin_user_overview() to authenticated;

-- 접근 차단/해제: 삭제하지 않고 학습 기록은 그대로 둔다. 관리자 계정과 본인은 차단할 수 없다.
create or replace function public.admin_set_user_disabled(p_user uuid, p_disabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_user = auth.uid() then raise exception 'cannot change self'; end if;
  update public.allowed_users set disabled = p_disabled where user_id = p_user and role <> 'admin';
  if not found then raise exception 'not found'; end if;
end $$;
revoke all on function public.admin_set_user_disabled(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_disabled(uuid, boolean) to authenticated;

commit;
