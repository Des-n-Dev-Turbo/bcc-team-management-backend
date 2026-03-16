import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '@/config.ts';

let sb: SupabaseClient | null = null;

export function getSupabase() {
  if (!sb) {
    sb = createClient(
      getConfig().SUPABASE_URL,
      getConfig().SUPABASE_SECRET_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }
  return sb;
}
