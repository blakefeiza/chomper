// Leaderboard backend. Leave both blank to run in LOCAL mode (scores stay in this browser).
// Paste your Supabase project URL and the PUBLISHABLE key here (safe to publish; row-level security protects the table).
// Never paste the secret key (sb_secret_...) anywhere in this folder.
window.CHOMPER_CONFIG = {
  supabaseUrl: 'https://qduefwwhmmreivyebhnl.supabase.co',   // e.g. https://abcdefghijkl.supabase.co
  anonKey: 'sb_publishable_kPYHb6l0lMAlbtnhstoM0Q_3YMuNvt6',       // Project Settings > API Keys > Publishable key (sb_publishable_...) or the legacy anon key
  table: 'chomper_scores'
};
