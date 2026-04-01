// One-off script to create a gym owner user
// Run: npx tsx scripts/create-gym-owner.ts

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

async function main() {
  // 1. Create auth user
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: "jack@gmail.com",
    phone: "91152552",
    password: "123456",
    email_confirm: true,
    phone_confirm: true,
  });

  if (authErr) {
    console.error("Auth create error:", authErr.message);
    // Try to find existing user
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const existing = users?.find((u) => u.email === "jack@gmail.com" || u.phone === "91152552");
    if (existing) {
      console.log("User already exists:", existing.id);
      await setupOwner(existing.id);
    }
    return;
  }

  console.log("User created:", authData.user.id);
  await setupOwner(authData.user.id);
}

async function setupOwner(userId: string) {
  // 2. Update profile role
  const { error: profileErr } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      full_name: "Jack",
      phone: "91152552",
      role: "gym_owner",
    }, { onConflict: "id" });

  if (profileErr) {
    console.error("Profile error:", profileErr.message);
  } else {
    console.log("Profile role set to gym_owner");
  }

  // 3. Get first gym to link
  const { data: gyms } = await supabase
    .from("gyms")
    .select("id, name")
    .eq("is_active", true)
    .order("name")
    .limit(5);

  console.log("Available gyms:");
  gyms?.forEach((g, i) => console.log(`  ${i + 1}. ${g.name} (${g.id})`));

  if (gyms && gyms.length > 0) {
    // Link to first gym
    const gym = gyms[0];
    const { error: staffErr } = await supabase
      .from("gym_staff")
      .upsert({
        user_id: userId,
        gym_id: gym.id,
        role: "owner",
      }, { onConflict: "user_id,gym_id" });

    if (staffErr) {
      console.error("gym_staff error:", staffErr.message);
    } else {
      console.log(`Linked as owner of: ${gym.name}`);
    }
  }

  console.log("\n✅ Done! Login with:");
  console.log("   Email: jack@gmail.com");
  console.log("   Password: 123456");
  console.log("   URL: https://gymhubmn.vercel.app");
}

main().catch(console.error);
