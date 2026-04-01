import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  // Check current enum values
  const { data: enumVals, error: enumErr } = await supabase.rpc("exec_sql", {
    sql: "SELECT enum_range(NULL::user_role)::text",
  });
  console.log("Current enum values:", enumVals, enumErr?.message);

  // Try adding gym_owner to enum
  const { error: alterErr } = await supabase.rpc("exec_sql", {
    sql: "ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gym_owner'",
  });
  
  if (alterErr) {
    console.log("RPC not available, trying raw SQL approach...");
    // Fallback: just show what SQL to run
    console.log("\n⚠️  Please run this SQL in Supabase Dashboard → SQL Editor:\n");
    console.log("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gym_owner';");
    console.log("UPDATE profiles SET role = 'gym_owner' WHERE id = '13bd65d3-893a-4101-8cb3-aa2200950ce7';");
  } else {
    console.log("Enum updated, now setting role...");
    const { error } = await supabase
      .from("profiles")
      .update({ role: "gym_owner" })
      .eq("id", "13bd65d3-893a-4101-8cb3-aa2200950ce7");
    console.log(error ? `Error: ${error.message}` : "✅ Role set to gym_owner");
  }
}

main().catch(console.error);
