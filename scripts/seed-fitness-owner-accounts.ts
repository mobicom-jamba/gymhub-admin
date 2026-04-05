/**
 * Фитнес эзэмшигчдийн утас бүрээр Supabase auth хэрэглэгч үүсгэж, нууц үгийг 123456 болгоно.
 * Нэвтрэх (вэб): утасны дугаар = оруулсан цифрүүд, нууц үг = 123456 (phone@gymhub.mn виртуал имэйл).
 *
 * Ажиллуулах (gymhub-admin төслийн root):
 *   npx tsx scripts/seed-fitness-owner-accounts.ts
 * Зөвхөн зохион байгуулалтын/туршилтын орчинд ашиглана — production-д 123456 бүү ашигла.
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { FITNESS_OWNER_SEED } from "./fitness-owner-seed-data";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = "123456";
const EMAIL_DOMAIN = "gymhub.mn";

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function displayPhone(d: string): string {
  return d;
}

/** "Name --" -> "Name" */
function normalizeGymTitle(name: string): string {
  return name.replace(/\s*--\s*$/i, "").trim();
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

async function findAuthUserByEmail(email: string) {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function findGymIdByName(gymName: string): Promise<string | null> {
  const title = normalizeGymTitle(gymName);
  const variants = [title, title.replace(/\s+Gym$/i, "").trim()].filter(Boolean);
  for (const v of variants) {
    if (!v) continue;
    const safe = v.replace(/[%_]/g, "");
    const { data: exact } = await supabase
      .from("gyms")
      .select("id")
      .ilike("name", safe)
      .eq("is_active", true)
      .limit(1);
    if (exact?.[0]?.id) return String(exact[0].id);
    const { data: fuzzy } = await supabase
      .from("gyms")
      .select("id")
      .ilike("name", `%${safe}%`)
      .eq("is_active", true)
      .limit(1);
    if (fuzzy?.[0]?.id) return String(fuzzy[0].id);
  }
  return null;
}

async function ensureUserAndProfile(opts: {
  digits: string;
  gymName: string;
}): Promise<{ userId: string; created: boolean }> {
  const email = `${opts.digits}@${EMAIL_DOMAIN}`;
  const fullName = `${normalizeGymTitle(opts.gymName)} — эзэмшигч`;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone: opts.digits,
      gym_name: opts.gymName,
    },
  });

  if (!createErr && created.user) {
    await supabase.from("profiles").upsert(
      {
        id: created.user.id,
        full_name: fullName,
        phone: displayPhone(opts.digits),
        role: "gym_owner",
      },
      { onConflict: "id" },
    );
    return { userId: created.user.id, created: true };
  }

  const msg = createErr?.message ?? "";
  if (
    msg.toLowerCase().includes("already been registered") ||
    msg.toLowerCase().includes("already registered") ||
    msg.includes("duplicate")
  ) {
    const found = await findAuthUserByEmail(email);
    if (!found) {
      throw new Error(`Could not create or find user for ${email}: ${msg}`);
    }
    await supabase.auth.admin.updateUserById(found.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        ...((found.user_metadata as Record<string, unknown>) ?? {}),
        full_name: fullName,
        phone: opts.digits,
        gym_name: opts.gymName,
      },
    });
    await supabase.from("profiles").upsert(
      {
        id: found.id,
        full_name: fullName,
        phone: displayPhone(opts.digits),
        role: "gym_owner",
      },
      { onConflict: "id" },
    );
    return { userId: found.id, created: false };
  }

  throw new Error(`createUser ${email}: ${msg}`);
}

async function linkGymStaff(userId: string, gymId: string): Promise<void> {
  const { error } = await supabase.from("gym_staff").upsert(
    {
      user_id: userId,
      gym_id: gymId,
      role: "owner",
    },
    { onConflict: "user_id,gym_id" },
  );
  if (error) {
    console.warn(`  gym_staff: ${error.message}`);
  }
}

async function main() {
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const seenDigits = new Set<string>();
  let ok = 0;
  let skipped = 0;

  for (const row of FITNESS_OWNER_SEED) {
    for (const raw of row.phones) {
      const d = digitsOnly(raw);
      if (!d) {
        console.warn(`Skip empty phone for ${row.gymName}`);
        skipped++;
        continue;
      }
      if (seenDigits.has(d)) {
        console.warn(`Skip duplicate digits ${d} (${row.gymName})`);
        skipped++;
        continue;
      }
      seenDigits.add(d);

      try {
        const { userId, created } = await ensureUserAndProfile({
          digits: d,
          gymName: row.gymName,
        });
        const gymId = await findGymIdByName(row.gymName);
        if (gymId) {
          await linkGymStaff(userId, gymId);
          console.log(`${created ? "✓" : "↻"} ${d}  ${row.gymName}  → linked gym`);
        } else {
          console.log(`${created ? "✓" : "↻"} ${d}  ${row.gymName}  (gym not matched — gym_staff skipped)`);
        }
        ok++;
      } catch (e) {
        console.error(`✗ ${d} ${row.gymName}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  console.log(`\nDone. ${ok} accounts processed, ${skipped} skipped.`);
  console.log(`Login on gymhub.mn: phone digits as entered → password ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
