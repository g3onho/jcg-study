-- 관리자 현황·피드백·접근 차단 (여러 번 실행해도 안전). Supabase SQL Editor에서 실행하세요.
-- 기존 학습 기록·계정은 바꾸지 않습니다(열 1개 추가, 함수 교체, 새 표 1개).
begin;

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
