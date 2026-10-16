/**
 * scripts/seed.mjs — one-shot local (or remote) database setup.
 *
 * Generates schema + 4 demo products + admin user, writes the SQL to a
 * temp file, and pipes it through `wrangler d1 execute`.
 *
 * Usage:
 *   node scripts/seed.mjs              # local D1 (wrangler dev state)
 *   node scripts/seed.mjs --remote     # remote D1 (after wrangler login)
 *
 * Env:
 *   ADMIN_EMAIL    (default admin@choirulhaq.com)
 *   ADMIN_PASSWORD (default: random, printed once — save it!)
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = join(root, 'worker');
const remote = process.argv.includes('--remote');

const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@choirulhaq.com';
const adminPassword = process.env.ADMIN_PASSWORD ?? randomBytes(10).toString('hex');
const adminId = `u_${randomBytes(8).toString('hex')}`;

// --- PBKDF2 hash — must match worker/src/auth.ts format ---
const salt = randomBytes(16);
const iterations = 600000;
// Node positional signature: (password, salt, iterations, keylen, digest)
const hash = pbkdf2Sync(adminPassword, salt, iterations, 32, 'sha256');
const passwordHash = `pbkdf2$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`;

// --- seed data (shared source of truth with the Worker) ---
const seedData = JSON.parse(readFileSync(join(workerDir, 'src', 'seed-data.json'), 'utf8'));

const productRows = seedData.products
  .map(
    (p) => `('${p.id}', '${p.slug}', '${p.name.replace(/'/g, "''")}', '${(p.description ?? '').replace(/'/g, "''")}', '${(p.short_description ?? '').replace(/'/g, "''")}', ${p.price_cents}, '${p.currency}', ${p.category ? `'${p.category}'` : 'NULL'}, ${p.thumbnail_url ? `'${p.thumbnail_url}'` : 'NULL'}, '${JSON.stringify(p.screenshots ?? []).replace(/'/g, "''")}', '${JSON.stringify(p.features ?? []).replace(/'/g, "''")}', ${p.external_url ? `'${p.external_url}'` : 'NULL'}, ${p.is_real}, ${p.active}, ${p.sort_order}, ${p.seo_title ? `'${p.seo_title.replace(/'/g, "''")}'` : 'NULL'}, ${p.seo_description ? `'${p.seo_description.replace(/'/g, "''")}'` : 'NULL'})`
  )
  .join(',\n      ');

const sql = `
${readFileSync(join(workerDir, 'src', 'schema.sql'), 'utf8')}

-- Demo products (idempotent upsert)
INSERT INTO products (id, slug, name, description, short_description, price_cents, currency, category, thumbnail_url, screenshots, features, external_url, is_real, active, sort_order, seo_title, seo_description)
VALUES
      ${productRows}
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  short_description = excluded.short_description, price_cents = excluded.price_cents,
  currency = excluded.currency, category = excluded.category,
  thumbnail_url = excluded.thumbnail_url, screenshots = excluded.screenshots,
  features = excluded.features, external_url = excluded.external_url,
  is_real = excluded.is_real, active = excluded.active,
  sort_order = excluded.sort_order, seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  updated_at = datetime('now');

-- Admin user (upserted by email — rerun with ADMIN_PASSWORD to rotate it)
INSERT INTO admin_users (id, email, password_hash, role, created_at)
VALUES ('${adminId}', '${adminEmail}', '${passwordHash}', 'admin', datetime('now'))
ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash;
`;

// SEED_OUT_FILE=<path>  → only write the SQL, skip execution (debug aid)
const outFile = process.env.SEED_OUT_FILE ?? join(workerDir, 'seed-generated.sql');
writeFileSync(outFile, sql);
if (process.env.SEED_OUT_FILE) {
  console.log(`SQL written to ${outFile} (${sql.length} bytes) — skipping execution.`);
  process.exit(0);
}
try {
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'shop-db', remote ? '--remote' : '--local', '--file', outFile],
    { cwd: workerDir, stdio: 'inherit' }
  );
} finally {
  rmSync(outFile, { force: true });
}

console.log('\n✅ Database seeded.');
console.log(`   Admin email:    ${adminEmail}`);
console.log(`   Admin password: ${adminPassword}`);
console.log('   ↳ SAVE THIS PASSWORD — it is shown only once.');
console.log('   ↳ Rerun `node scripts/seed.mjs` with ADMIN_PASSWORD=... to rotate it.');
