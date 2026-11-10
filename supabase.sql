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

-- ---------------------------------------------------------------------------
-- Name moderation (enforced in the database, so it also stops direct API calls).
-- Two tiers, matched after lowercasing, swapping digit look-alikes (0 o, 1 i, 3 e, 4 a, 5 s, 7 t),
-- and stripping spaces and punctuation. Repeated letters ("fuuuck") are caught too.
--   strong: blocked anywhere inside the name
--   whole : blocked only as a whole word, so names like PEACOCK, GRAPE, CLASS or BASS still work
-- Edit the two lists below and re-run to change them. Existing rows are not touched.
-- ---------------------------------------------------------------------------
create or replace function public.chomper_name_allowed(n text) returns boolean
language plpgsql stable as $$
declare
  norm    text   := translate(lower(n), '013457', 'oieast');
  compact text   := regexp_replace(translate(lower(n), '013457', 'oieast'), '[^a-z]', '', 'g');
  w       text;
  pat     text;
  strong  text[] := array['fuck','fvck','shit','cunt','nigg','fagg','bitch','whore','slut','twat','pussy','wanker','jizz','blowjob',
                          'asshole','nazi','hitler','rapist','kkk','porn','cocksuck','dicksuck'];
  whole   text[] := array['ass','arse','anus','anal','tit','tits','boob','boobs','cum','cock','dick','dik','penis','vagina','sex','rape',
                          'fag','dyke','tranny','retard','retarded','spic','kike','coon','chink','paki','hoe','kys','milf','thot','wank'];
begin
  foreach w in array strong loop
    if compact ~ regexp_replace(w, '(.)', '\1+', 'g') then return false; end if;
  end loop;
  foreach w in array whole loop
    pat := '^' || regexp_replace(w, '(.)', '\1+', 'g') || '$';
    if compact ~ pat then return false; end if;
    if exists (select 1 from regexp_split_to_table(norm, '[ _.-]+') t where regexp_replace(t, '[^a-z]', '', 'g') ~ pat) then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.chomper_guard() returns trigger language plpgsql as $$
begin
  if not public.chomper_name_allowed(new.name) then raise exception 'name_not_allowed'; end if;
  return new;
end $$;

drop trigger if exists chomper_guard_trg on public.chomper_scores;
create trigger chomper_guard_trg before insert on public.chomper_scores
  for each row execute function public.chomper_guard();

-- Find anything already on the board that the new rules would reject (review, then delete by id):
--   select id, name, score from public.chomper_scores where not public.chomper_name_allowed(name);
