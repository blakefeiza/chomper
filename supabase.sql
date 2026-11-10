-- Chomper leaderboard table. Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Safe to re-run.

create table if not exists public.chomper_scores (
  id          bigint generated always as identity primary key,
  name        text        not null,
  score       integer     not null,
  level       integer     not null default 1,
  created_at  timestamptz not null default now(),
  -- cheap integrity checks (a perfect game cannot exceed ~3.3 million points)
  constraint chomper_name_ok  check (char_length(name) between 1 and 10 and name ~ '^[A-Z0-9 _.-]+$'),
  constraint chomper_score_ok check (score between 0 and 3333360),
  constraint chomper_level_ok check (level between 1 and 256)
);

create index if not exists chomper_scores_score_idx   on public.chomper_scores (score desc, created_at asc);
create index if not exists chomper_scores_created_idx on public.chomper_scores (created_at desc);

alter table public.chomper_scores enable row level security;

-- Anyone may read the board and add a score. Nobody can edit or delete through the public key.
drop policy if exists "chomper read"   on public.chomper_scores;
drop policy if exists "chomper insert" on public.chomper_scores;
create policy "chomper read"   on public.chomper_scores for select to anon using (true);
create policy "chomper insert" on public.chomper_scores for insert to anon with check (score > 0);

-- Moderation: delete a bad row from the dashboard (Table Editor) or with the SQL editor, e.g.
--   delete from public.chomper_scores where id = 123;
