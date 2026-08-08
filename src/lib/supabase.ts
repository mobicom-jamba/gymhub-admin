import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase-env";

const supabaseUrl = supabaseEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = supabaseEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const supabaseServiceKey = supabaseEnv("SUPABASE_SERVICE_ROLE_KEY") || undefined;

/** Browser client – uses anon key, respects RLS. Use when admin is signed in. */
export function createBrowserClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

/** Server client – uses service role, bypasses RLS. Use in server components/API routes. */
export function createAdminClient() {
  const url = supabaseUrl || "https://placeholder.supabase.co";
  const key = supabaseServiceKey || supabaseAnonKey || "placeholder";
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
