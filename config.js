// Leaderboard backend. Leave both blank to run in LOCAL mode (scores stay in this browser).
// Paste your Supabase project URL and the public "anon" key here (the anon key is designed to be public; row-level security protects the table).
window.CHOMPER_CONFIG = {
  supabaseUrl: '',   // e.g. https://abcdefghijkl.supabase.co
  anonKey: '',       // Project Settings > API > anon public
  table: 'chomper_scores'
};
