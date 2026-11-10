# Chomper

A faithful arcade maze chase (own code and vector art, no original assets) with a **Today** and **All Time** leaderboard.

- Original-style rules: 244 dots, four ghosts with their own targeting (chase, ambush, flank, shy), scatter/chase waves,
  frightened mode, ghost-house release counters, "Elroy" speed-ups, fruit, extra life at 10,000, per-level speed tables.
  Not included: the cut-scenes and the level-256 kill screen.
- Controls: arrow keys or WASD, `P` pause, `M` mute. Swipe or the on-screen pad on phones.

## Turn on the shared leaderboard (Supabase)
1. Supabase dashboard > SQL Editor > paste `supabase.sql` > Run.
2. Project Settings > API: copy the project URL and the `anon` public key into `config.js`.
3. Commit and push. The chip on the board switches from LOCAL to LIVE.

Without keys the game runs in LOCAL mode (scores stay in the browser).

## Embed in Tableau Public
Dashboard > Web Page object > `https://<user>.github.io/chomper/`. Size the dashboard about 1100 x 900.
Click the game once so it gets keyboard focus.

## Moderation
Delete a row in the Supabase Table Editor. The public key can only read and add rows.
