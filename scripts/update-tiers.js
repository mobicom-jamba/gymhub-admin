/**
 * update-tiers.js
 * Reads GYMHUB_All_Members.xlsx and updates every profile with:
 *   - membership_tier: 780k+ → 'premium', <780k → 'early'
 *   - membership_started_at: expire_date − 1 year
 *   - membership_expires_at: from Excel
 *   - membership_status: 'active'
 *   - organization: from Excel
 *
 * Does NOT touch auth users — profiles only.
 */
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function getTier(amount) {
  return Number(amount) >= 780000 ? 'premium' : 'early';
}

function getStartedAt(expireDate) {
  if (!expireDate) return null;
  const d = new Date(expireDate);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

async function loadAllAuthUsers() {
  console.log('📥 Loading all auth users (building email→id map)...');
  const emailToId = {};
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    if (!data || data.users.length === 0) break;
    data.users.forEach(u => {
      if (u.email) emailToId[u.email.toLowerCase()] = u.id;
    });
    console.log(`  Loaded page ${page} — ${Object.keys(emailToId).length} users so far`);
    if (data.users.length < 1000) break;
    page++;
  }
  return emailToId;
}

async function main() {
  // Check membership_started_at column exists
  const { data: sample } = await supabase.from('profiles').select('*').limit(1);
  if (sample && sample[0] && !('membership_started_at' in sample[0])) {
    console.error('\n❌ Missing column! Run this SQL in Supabase SQL Editor first:\n');
    console.error('  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS membership_started_at TIMESTAMPTZ;\n');
    process.exit(1);
  }

  console.log('📖 Reading Excel...');
  const wb = XLSX.readFile('/Users/jamba/Downloads/GYMHUB_All_Members.xlsx');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['All Members']);
  console.log(`📊 ${rows.length} rows`);

  const emailToId = await loadAllAuthUsers();

  let updated = 0, notFound = 0, errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = String(row.email || '').trim().toLowerCase();
    const phone = String(row.utas || '').trim();
    const ovog = String(row.ovog || '').trim();
    const ner = String(row.ner || '').trim();
    const fullName = [ovog, ner].filter(Boolean).join(' ');
    const organization = String(row.organization || '').trim();
    const amount = Number(row.total_amount) || 0;
    const tier = getTier(amount);
    const expireDate = row.expire_date ? new Date(row.expire_date).toISOString() : null;
    const startedAt = getStartedAt(row.expire_date);

    const userId = emailToId[email];
    if (!userId) {
      console.log(`[${i + 1}/${rows.length}] ⚠️  Not found in auth: ${email}`);
      notFound++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${rows.length}] ${fullName} | ${tier} | ${expireDate?.slice(0, 10) ?? '—'} ... `);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone,
        organization,
        role: 'user',
        membership_tier: tier,
        membership_status: 'active',
        membership_expires_at: expireDate,
        membership_started_at: startedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.log(`❌ ${error.message}`);
      errors.push({ email, error: error.message });
    } else {
      console.log('✅');
      updated++;
    }

    if (i % 20 === 0) await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n════════════════════════════════');
  console.log(`✅ Updated:   ${updated}`);
  console.log(`⚠️  Not found: ${notFound}`);
  console.log(`❌ Errors:    ${errors.length}`);
  if (errors.length > 0) {
    errors.forEach(e => console.log(`  ${e.email}: ${e.error}`));
  }
  console.log('════════════════════════════════');
}

main().catch(console.error);
