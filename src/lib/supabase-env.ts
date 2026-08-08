/**
 * .env-д орсон trailing newline/space-ийг хасна (realtime wss apikey %0A-аас сэргийлнэ).
 *
 * IMPORTANT: Next.js зөвхөн `process.env.NEXT_PUBLIC_*` статик хандалтыг client bundle-д
 * inline хийнэ — `process.env[name]` динамик хандалт хоосон буцаана.
 */
function clean(v: string | undefined): string {
  let s = (v ?? "").trim();
  while (s.endsWith("\\n")) s = s.slice(0, -2).trimEnd();
  return s.trim();
}

export function supabaseEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY" | "SUPABASE_SERVICE_ROLE_KEY",
): string {
  if (name === "NEXT_PUBLIC_SUPABASE_URL") {
    return clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  }
  if (name === "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
    return clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
