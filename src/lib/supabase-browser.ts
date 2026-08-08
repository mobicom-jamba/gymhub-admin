import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase-env";

let client: SupabaseClient | null = null;

export function createBrowserSupabaseClient() {
  if (client) {
    return client;
  }

  client = createBrowserClient(
    supabaseEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        headers: {
          "x-application-name": "gymhub-admin",
        },
      },
    }
  );

  return client;
}
