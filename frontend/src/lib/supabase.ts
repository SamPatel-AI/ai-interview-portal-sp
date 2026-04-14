import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xaoqqqiniuatyvdwzjnj.supabase.co';

export const hasSupabaseConfig = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

const supabaseAnonKey = hasSupabaseConfig
  ? import.meta.env.VITE_SUPABASE_ANON_KEY
  : 'demo-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: hasSupabaseConfig,
    persistSession: hasSupabaseConfig,
    detectSessionInUrl: hasSupabaseConfig,
  },
});
