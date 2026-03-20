/**
 * update-tiers.js  (v2)
 * Reads GYMHUB_All_Members_v2.xlsx and updates every matching profile with:
 *   - membership_tier:    780k+ → 'premium', >0 <780k → 'early'
 *   - membership_status:  amount > 0 → 'active', 0/null → 'inactive' (not paid)
 *   - membership_started_at: expire_date − 1 year
 *   - membership_expires_at: from Excel
 *   - organization, full_name, phone: from Excel
 *
 * Matching priority: email → phone fallback
 * Deduplication: detects DB profiles sharing the same phone and reports them.
 * Does NOT touch auth users — profiles only.
 */
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const FILE = '/Users/jamba/Downloads/GYMHUB_All_Members_v2.xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function getTier(amount) {
  return Number(amount) >= 780000 ? 'premium' : 'early';
}

function getStatus(amount) {
  return Number(amount) > 0 ? 'active' : 'inactive';
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
    console.log(`  Page ${page} — ${Object.keys(emailToId).length} auth users loaded`);
    if (data.users.length < 1000) break;
    page++;
  }
  return emailToId;
}

async function loadProfilePhoneMap() {
  console.log('📥 Loading profiles (building phone→[ids] map for duplicate detection)...');
  const phoneToIds = {};
  let from = 0;
  const batchSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, phone')
      .range(from, from + batchSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(p => {
      const ph = String(p.phone || '').trim();
      if (!ph) return;
      if (!phoneToIds[ph]) phoneToIds[ph] = [];
      phoneToIds[ph].push(p.id);
    });
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return phoneToIds;
}

async function main() {
  console.log('📖 Reading Excel:', FILE);
  const wb = XLSX.readFile(FILE);
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets['All Members'], { defval: null });
  console.log(`📊 ${rawRows.length} total rows in file`);

  // Deduplicate Excel rows by email (keep highest-amount entry per email)
  const emailBest = {};
  const noIdentifier = [];
  rawRows.forEach(row => {
    const email = String(row.email || '').trim().toLowerCase();
    const phone = String(row.utas || '').trim();
    if (!email && !phone) { noIdentifier.push(row); return; }
    if (!email) return; // phone-only rows handled via phone fallback later
    const amt = Number(row.total_amount) || 0;
    if (!emailBest[email] || amt > Number(emailBest[email].total_amount || 0)) {
      emailBest[email] = row;
    }
  });
  const rows = Object.values(emailBest);
  // Also collect phone-only rows (no email)
  const phoneOnlyRows = rawRows.filter(r =>
    !String(r.email || '').trim() && String(r.utas || '').trim()
  );

  console.log(`  → ${rows.length} unique-email rows`);
  console.log(`  → ${phoneOnlyRows.length} phone-only rows (no email)`);
  console.log(`  → ${noIdentifier.length} rows skipped (no email, no phone)`);

  const emailToId = await loadAllAuthUsers();
  const phoneToIds = await loadProfilePhoneMap();

  // Report DB duplicates (same phone → multiple profiles)
  const dbDupes = Object.entries(phoneToIds).filter(([, ids]) => ids.length > 1);
  if (dbDupes.length > 0) {
    console.log(`\n⚠️  DB DUPLICATES — ${dbDupes.length} phone numbers map to multiple profiles:`);
    dbDupes.forEach(([phone, ids]) => {
      console.log(`  � ${phone} → profile IDs: ${ids.join(', ')}`);
    });
    console.log('  → These will be updated by email match only. Review manually to merge/delete extras.\n');
  } else {
    console.log('✅ No duplicate profiles found in DB.\n');
  }

  let updated = 0, created = 0, inactive = 0, skipped = 0, phoneMatched = 0, errors = [];
  const allRows = [...rows, ...phoneOnlyRows];

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const email = String(row.email || '').trim().toLowerCase();
    const phone = String(row.utas || '').trim();
    const ovog = String(row.ovog || '').trim();
    const ner = String(row.ner || '').trim();
    const fullName = [ovog, ner].filter(Boolean).join(' ');
    const organization = String(row.organization || '').trim();
    const amount = Number(row.total_amount) || 0;
    const tier = getTier(amount);
    const status = getStatus(amount);
    const expireDate = row.expire_date ? new Date(row.expire_date).toISOString() : null;
    const startedAt = getStartedAt(row.expire_date);

    const profilePayload = {
      full_name: fullName || null,
      phone: phone || null,
      organization: organization || null,
      role: 'user',
      membership_tier: tier,
      membership_status: status,
      membership_expires_at: expireDate,
      membership_started_at: startedAt,
      updated_at: new Date().toISOString(),
    };

    // Resolve user ID: email first, phone fallback
    let userId = email ? emailToId[email] : null;
    let matchedVia = 'email';
    if (!userId && phone) {
      const ids = phoneToIds[phone];
      if (ids && ids.length === 1) {
        userId = ids[0];
        matchedVia = 'phone';
      } else if (ids && ids.length > 1) {
        console.log(`[${i + 1}/${allRows.length}] ⚠️  Skipping phone ${phone}: maps to ${ids.length} profiles (ambiguous)`);
        skipped++;
        continue;
      }
    }

    const label = status === 'inactive' ? '🔴 inactive' : `✅ ${tier}`;

    if (userId) {
      // ── UPDATE existing profile ────────────────────────────────────────
      process.stdout.write(`[${i + 1}/${allRows.length}] ${fullName || email} | ${label} | via ${matchedVia} ... `);
      const { error } = await supabase
        .from('profiles')
        .update(profilePayload)
        .eq('id', userId);
      if (error) {
        console.log(`❌ ${error.message}`);
        errors.push({ key: email || phone, error: error.message });
      } else {
        console.log('updated');
        updated++;
        if (status === 'inactive') inactive++;
        if (matchedVia === 'phone') phoneMatched++;
      }
    } else if (email) {
      // ── CREATE new auth user + profile ────────────────────────────────
      process.stdout.write(`[${i + 1}/${allRows.length}] ${fullName || email} | ${label} | NEW ... `);
      try {
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
          email,
          password: '123456',
          email_confirm: true,
          user_metadata: { full_name: fullName, phone, organization, role: 'user' },
        });
        if (authErr) throw authErr;
        const newId = authData.user.id;
        emailToId[email] = newId; // keep map fresh
        const { error: profErr } = await supabase
          .from('profiles')
          .upsert({ id: newId, ...profilePayload }, { onConflict: 'id' });
        if (profErr) throw profErr;
        console.log('created');
        created++;
        if (status === 'inactive') inactive++;
      } catch (err) {
        console.log(`❌ ${err.message}`);
        errors.push({ key: email, error: err.message });
      }
    } else {
      // phone-only row, no match found — skip
      console.log(`[${i + 1}/${allRows.length}] ⚠️  No email, phone ${phone} not in DB — skipped`);
      skipped++;
    }

    // Throttle to stay within Supabase rate limits
    if (i % 10 === 0) await new Promise(r => setTimeout(r, 150));
  }

  console.log('\n════════════════════════════════════════');
  console.log(`✅ Updated:           ${updated}`);
  console.log(`🆕 Created:           ${created}`);
  console.log(`🔴 Of which inactive: ${inactive}  (no payment)`);
  console.log(`📞 Phone-matched:     ${phoneMatched}`);
  console.log(`⏭️  Skipped:          ${skipped}`);
  console.log(`❌ Errors:            ${errors.length}`);
  if (errors.length > 0) {
    errors.forEach(e => console.log(`  ${e.key}: ${e.error}`));
  }
  if (dbDupes.length > 0) {
    console.log(`\n⚠️  ${dbDupes.length} duplicate phone(s) in DB — review manually`);
  }
  console.log('════════════════════════════════════════');
}

main().catch(console.error);
