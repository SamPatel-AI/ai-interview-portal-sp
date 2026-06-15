import { createClient } from '@supabase/supabase-js';

// Single source of truth. Env vars may override, but the fallback MUST stay
// the production project so the client can never be repointed by mistake.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://xaoqqqiniuatyvdwzjnj.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhb3FxcWluaXVhdHl2ZHd6am5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjIxNDMsImV4cCI6MjA5MTY5ODE0M30.XMotp0iYU-yKHgnYvUEOYx0syl-A1Sh6mb1_XE8Hl5w';

export const hasSupabaseConfig = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
});
