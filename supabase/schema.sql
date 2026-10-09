-- 정보처리기사 실기 개인 학습 앱 — Supabase 스키마 (여러 번 실행해도 안전하도록 작성)
-- 원칙: 모든 학습 기록·콘텐츠·원본 파일은 '허용된 사용자'만 접근. 익명 접근 불가.

create table if not exists public.allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.allowed_users enable row level security;
-- 정책 없음 → 클라이언트에서 읽기/쓰기 불가 (아래 security definer 함수로만 확인)

create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where user_id = auth.uid());
$$;
revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

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
create policy private_read on storage.objects for select to authenticated using (bucket_id = 'private' and public.is_allowed());
create policy private_insert on storage.objects for insert to authenticated with check (bucket_id = 'private' and public.is_allowed());
create policy private_update on storage.objects for update to authenticated using (bucket_id = 'private' and public.is_allowed());
create policy private_delete on storage.objects for delete to authenticated using (bucket_id = 'private' and public.is_allowed());
