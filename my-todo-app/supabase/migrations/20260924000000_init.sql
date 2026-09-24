-- Todo アプリのテーブル・RLS・トリガーの定義
--
-- 新しい Supabase プロジェクトでは、ダッシュボードの SQL Editor に
-- このファイルの内容を貼り付けて実行するとアプリが動く状態になる。
-- （Supabase CLI を使う場合は `supabase db push` でも適用できる）

-- ---------------------------------------------------------------
-- profiles: ユーザーの表示名
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "自分のプロフィールを読める"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "自分のプロフィールを更新できる"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 新規登録時に signUp の options.data.name から profiles の行を作る
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), new.email, 'ユーザー')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- todos: タスク
-- ---------------------------------------------------------------
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  -- アプリからは送らないので、ログイン中のユーザーが自動で入る
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (trim(text) <> ''),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index todos_user_id_created_at_idx on public.todos (user_id, created_at);

alter table public.todos enable row level security;

create policy "自分のタスクを読める"
  on public.todos for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "自分のタスクを追加できる"
  on public.todos for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "自分のタスクを更新できる"
  on public.todos for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "自分のタスクを削除できる"
  on public.todos for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- comments: タスクへのコメント
-- ---------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  -- タスクを削除するとコメントも一緒に削除される
  todo_id uuid not null references public.todos (id) on delete cascade,
  -- profiles を参照しているので、select で comments(profiles(name)) と書ける
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text text not null check (trim(text) <> ''),
  created_at timestamptz not null default now()
);

create index comments_todo_id_created_at_idx on public.comments (todo_id, created_at);

alter table public.comments enable row level security;

-- 自分のタスクに付いたコメントだけ読める
create policy "自分のタスクのコメントを読める"
  on public.comments for select
  to authenticated
  using (
    exists (
      select 1 from public.todos
      where todos.id = comments.todo_id
        and todos.user_id = (select auth.uid())
    )
  );

-- 他人のタスクの todo_id を指定してコメントを追加することはできない
create policy "自分のタスクにコメントを追加できる"
  on public.comments for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.todos
      where todos.id = comments.todo_id
        and todos.user_id = (select auth.uid())
    )
  );
