/**
 * Quick diagnostic: check if a user with phone 80076006 exists in Supabase.
 *
 * Usage:
 *   npx tsx scripts/check-user.ts 80076006
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const phone = process.argv[2] || "80076006";
const virtualEmail = `${phone}@gymhub.mn`;

async function main() {
  console.log(`\n🔍 Checking user with phone: ${phone}`);
  console.log(`   Virtual email: ${virtualEmail}\n`);

  // 1. Check profiles table
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, phone, email, role, membership_status, membership_tier")
    .eq("phone", phone)
    .maybeSingle();

  if (profileErr) {
    console.error("❌ Profile query error:", profileErr.message);
  } else if (profile) {
    console.log("✅ Profile found:", JSON.stringify(profile, null, 2));
  } else {
    console.log("⚠️  No profile found with phone =", phone);
  }

  // 2. Check auth user by virtual email
  let page = 1;
  let authUserByEmail = null;
  outer: for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      console.error("❌ Auth list error:", error.message);
      break;
    }
    for (const u of data.users) {
      if (u.email?.toLowerCase() === virtualEmail.toLowerCase()) {
        authUserByEmail = u;
        break outer;
      }
    }
    if (data.users.length < 1000) break;
    page++;
  }

  if (authUserByEmail) {
    console.log(`\n✅ Auth user found by email (${virtualEmail}):`);
    console.log("   ID:", authUserByEmail.id);
    console.log("   Email:", authUserByEmail.email);
    console.log("   Phone:", authUserByEmail.phone);
    console.log("   Metadata:", JSON.stringify(authUserByEmail.user_metadata));
    console.log("   Created:", authUserByEmail.created_at);
    console.log("   Confirmed:", authUserByEmail.email_confirmed_at ? "YES" : "NO");
  } else {
    console.log(`\n⚠️  No auth user with email = ${virtualEmail}`);
  }

  // 3. If profile found, check auth user by profile.id
  if (profile?.id) {
    const { data: authById } = await supabase.auth.admin.getUserById(profile.id);
    if (authById?.user) {
      console.log(`\n✅ Auth user found by profile ID (${profile.id}):`);
      console.log("   Email:", authById.user.email);
      console.log("   Phone:", authById.user.phone);
      console.log("   Confirmed:", authById.user.email_confirmed_at ? "YES" : "NO");
      if (authById.user.email !== virtualEmail) {
        console.log(
          `\n⚠️  EMAIL MISMATCH: Auth email is "${authById.user.email}" but login uses "${virtualEmail}"`
        );
        console.log(
          "   → The phone-lookup API should resolve this, but it may have failed."
        );
      }
    } else {
      console.log(`\n⚠️  Auth user NOT found by profile.id = ${profile.id}`);
    }
  }

  console.log("\n--- Done ---\n");
}

main().catch(console.error);
