import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const userId = "13bd65d3-893a-4101-8cb3-aa2200950ce7";

  // Update auth user email to match the virtual email format used by login
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    email: "91152552@gymhub.mn",
    email_confirm: true,
  });

  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log("✅ Email updated to 91152552@gymhub.mn");
    console.log("Now login with phone: 91152552, password: 123456");
  }
}

main().catch(console.error);
