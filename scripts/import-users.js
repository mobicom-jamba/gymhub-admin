const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Tier logic:
//   total_amount >= 780000 → 'premium'
//   total_amount <  780000 → 'early'  (includes 480k and nulls)
function getTier(amount) {
  return Number(amount) >= 780000 ? 'premium' : 'early';
}

// membership_started_at = expire_date minus exactly 1 year
function getStartedAt(expireDate) {
  if (!expireDate) return null;
  const d = new Date(expireDate);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

async function importUsers() {
  console.log('📖 Reading Excel file...');
  const wb = XLSX.readFile('/Users/jamba/Downloads/GYMHUB_All_Members.xlsx');
  const data = XLSX.utils.sheet_to_json(wb.Sheets['All Members']);
  console.log(`📊 Found ${data.length} users to import`);

  // Check if extra columns exist by probing one profile
  const { data: sample } = await supabase.from('profiles').select('*').limit(1);
  const existingCols = sample && sample[0] ? Object.keys(sample[0]) : [];
  const hasOrg = existingCols.includes('organization');
  const hasExpiry = existingCols.includes('membership_expires_at');
  const hasStatus = existingCols.includes('membership_status');

  if (!hasOrg || !hasExpiry) {
    console.warn('\n⚠️  Missing columns detected! Please run this SQL in your Supabase SQL Editor first:\n');
    if (!hasOrg)     console.warn('  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization TEXT;');
    if (!hasExpiry)  console.warn('  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ;');
    if (!hasStatus)  console.warn('  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS membership_status TEXT DEFAULT \'active\';');
    console.warn('\nThen re-run this script.\n');
    process.exit(1);
  }

  let success = 0;
  let skipped = 0;
  let errors = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const phone = String(row.utas || '').trim();
    const email = String(row.email || '').trim();
    const ovog = String(row.ovog || '').trim();
    const ner = String(row.ner || '').trim();
    const fullName = [ovog, ner].filter(Boolean).join(' ');
    const organization = String(row.organization || '').trim();
    const expireDate = row.expire_date ? new Date(row.expire_date).toISOString() : null;
    const amount = Number(row.total_amount) || 480000;

    if (!phone || !email) {
      console.log(`⚠️  Skipping row ${i + 1}: missing phone or email`);
      skipped++;
      continue;
    }

    console.log(`[${i + 1}/${data.length}] ${fullName} | ${phone} | ${organization}`);

    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: '123456',
        email_confirm: true,
        user_metadata: { full_name: fullName, phone, organization, role: 'user' },
      });

      if (authError) {
        if (authError.message.toLowerCase().includes('already been registered') ||
            authError.message.toLowerCase().includes('already registered') ||
            authError.message.toLowerCase().includes('duplicate') ||
            authError.status === 422) {
          // User already exists — look up their ID and update profile
          const { data: existingList } = await supabase.auth.admin.listUsers({ perPage: 1 });
          // Search by email in admin API
          const found = await findUserByEmail(email);
          if (found) {
            await upsertProfile(found.id, { fullName, phone, organization, expireDate, amount });
            console.log(`  ↻ Updated existing: ${email}`);
          } else {
            console.log(`  ⚠️  Already exists but can't find ID: ${email}`);
          }
          skipped++;
          continue;
        }
        throw authError;
      }

      const userId = authData.user.id;

      // 2. Upsert profile
      await upsertProfile(userId, { fullName, phone, organization, expireDate, amount });

      success++;
      console.log(`  ✅ Done`);

      // Throttle to avoid rate limit (10 req/s)
      if (i % 10 === 0) await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      errors.push({ row: i + 1, email, error: err.message });
    }
  }

  console.log('\n════════════════════════════════');
  console.log(`✅ Imported:  ${success}`);
  console.log(`↻  Skipped:  ${skipped}`);
  console.log(`❌ Errors:   ${errors.length}`);
  if (errors.length > 0) {
    console.log('\nFailed rows:');
    errors.forEach(e => console.log(`  Row ${e.row} (${e.email}): ${e.error}`));
  }
  console.log('════════════════════════════════');
}

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (!data || data.users.length === 0) break;
    const found = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) break;
    page++;
  }
  return null;
}

async function upsertProfile(userId, { fullName, phone, organization, expireDate, amount }) {
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      full_name: fullName,
      phone: phone,
      organization: organization,
      role: 'user',
      membership_tier: 'premium',
      membership_status: 'active',
      membership_expires_at: expireDate,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (profileError) throw profileError;
}

importUsers().catch(console.error);
