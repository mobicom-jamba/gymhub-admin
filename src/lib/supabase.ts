import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
