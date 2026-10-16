/**
 * seed.ts — insert demo products (idempotent) from seed-data.json.
 * Used by POST /api/admin/seed-products and scripts/seed.mjs (same source).
 */
import type { D1Database } from '@cloudflare/workers-types';
import seedData from './seed-data.json';

export type SeedProduct = (typeof seedData.products)[number];

export async function seedProducts(db: D1Database): Promise<number> {
  const stmt = db.prepare(`
    INSERT INTO products (
      id, slug, name, description, short_description, price_cents, currency,
      category, thumbnail_url, screenshots, features, external_url, is_real,
      active, sort_order, seo_title, seo_description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      name = excluded.name,
      description = excluded.description,
      short_description = excluded.short_description,
      price_cents = excluded.price_cents,
      currency = excluded.currency,
      category = excluded.category,
      thumbnail_url = excluded.thumbnail_url,
      screenshots = excluded.screenshots,
      features = excluded.features,
      external_url = excluded.external_url,
      is_real = excluded.is_real,
      active = excluded.active,
      sort_order = excluded.sort_order,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description,
      updated_at = datetime('now')
  `);

  let count = 0;
  for (const p of seedData.products as SeedProduct[]) {
    await stmt.bind(
      p.id,
      p.slug,
      p.name,
      p.description,
      p.short_description,
      p.price_cents,
      p.currency,
      p.category,
      p.thumbnail_url,
      JSON.stringify(p.screenshots ?? []),
      JSON.stringify(p.features ?? []),
      p.external_url,
      p.is_real,
      p.active,
      p.sort_order,
      p.seo_title,
      p.seo_description
    ).run();
    count++;
  }
  return count;
}
