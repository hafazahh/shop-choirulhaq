/**
 * routes/admin.ts — admin auth + product/order management.
 * All routes except /login require a valid admin session cookie.
 */
import { Hono } from 'hono';
import type { Env } from '../db';
import { mapOrder, mapProduct, type Product } from '../db';
import { createSession, requireAdmin, sessionCookieHeader, clearSessionCookieHeader, verifyPassword, parseCookies } from '../auth';
import { seedProducts } from '../seed';

const admin = new Hono<{ Bindings: Env; Variables: { adminUserId: string } }>();

const ORDER_STATUSES = ['pending', 'paid', 'delivered', 'cancelled', 'refunded'] as const;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// POST /api/admin/login { email, password }
admin.post('/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return c.json({ error: 'Email and password are required.' }, 400);

  const row = await c.env.DB.prepare('SELECT * FROM admin_users WHERE email = ?').bind(email).first<{
    id: string;
    password_hash: string;
  }>();
  // Always run a dummy hash comparison to blunt user enumeration timing
  const hash = row?.password_hash ?? 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const ok = await verifyPassword(password, hash);
  if (!row || !ok) return c.json({ error: 'Invalid email or password.' }, 401);

  const sessionId = await createSession(c.env, row.id);
  c.header('Set-Cookie', sessionCookieHeader(sessionId, c.env));
  return c.json({ ok: true, email });
});

// POST /api/admin/logout
admin.post('/logout', async (c) => {
  const cookies = parseCookies(c.req.header('cookie'));
  const sessionId = cookies['admin_session'];
  if (sessionId) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  c.header('Set-Cookie', clearSessionCookieHeader());
  return c.json({ ok: true });
});

// GET /api/admin/me
admin.get('/me', requireAdmin, async (c) => {
  return c.json({ ok: true });
});

// ---------- Products ----------

interface ProductInput {
  name?: string;
  slug?: string;
  description?: string | null;
  short_description?: string | null;
  price_cents?: number;
  category?: string | null;
  thumbnail_url?: string | null;
  screenshots?: string[];
  features?: string[];
  external_url?: string | null;
  is_real?: number;
  active?: number;
  sort_order?: number;
  seo_title?: string | null;
  seo_description?: string | null;
}

function parseProductInput(
  body: Record<string, unknown>
): { error: string } | { data: ProductInput } {
  const data: ProductInput = {};
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (typeof body.slug === 'string' && SLUG_RE.test(body.slug.trim())) data.slug = body.slug.trim();
  if (typeof body.description === 'string') data.description = body.description.trim() || null;
  if (typeof body.short_description === 'string') data.short_description = body.short_description.trim() || null;
  if (body.price_cents !== undefined) {
    const n = Math.floor(Number(body.price_cents));
    if (!Number.isFinite(n) || n < 0) return { error: 'price_cents must be a non-negative integer.' };
    data.price_cents = n;
  }
  if (typeof body.category === 'string') data.category = body.category.trim() || null;
  if (typeof body.thumbnail_url === 'string') data.thumbnail_url = body.thumbnail_url.trim() || null;
  if (Array.isArray(body.screenshots)) data.screenshots = body.screenshots.map(String);
  if (Array.isArray(body.features)) data.features = body.features.map(String);
  if (typeof body.external_url === 'string') data.external_url = body.external_url.trim() || null;
  if (body.is_real !== undefined) data.is_real = Number(body.is_real) ? 1 : 0;
  if (body.active !== undefined) data.active = Number(body.active) ? 1 : 0;
  if (body.sort_order !== undefined) data.sort_order = Math.floor(Number(body.sort_order)) || 0;
  if (typeof body.seo_title === 'string') data.seo_title = body.seo_title.trim() || null;
  if (typeof body.seo_description === 'string') data.seo_description = body.seo_description.trim() || null;
  return { data };
}

function productId(): string {
  return `p_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

// GET /api/admin/products — all products incl. inactive
admin.get('/products', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM products ORDER BY sort_order ASC, created_at ASC'
  ).all();
  return c.json({ products: results.map(mapProduct) });
});

// POST /api/admin/products — create
admin.post('/products', requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.name !== 'string' || !body.name.trim()) return c.json({ error: 'name is required.' }, 400);
  if (typeof body.slug !== 'string' || !SLUG_RE.test(body.slug.trim())) {
    return c.json({ error: 'slug is required (lowercase letters, numbers, dashes).' }, 400);
  }
  const existing = await c.env.DB.prepare('SELECT id FROM products WHERE slug = ?').bind(body.slug.trim()).first();
  if (existing) return c.json({ error: 'A product with that slug already exists.' }, 409);

  const parsed = parseProductInput(body);
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const data = parsed.data;
  const id = productId();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  await c.env.DB.prepare(
    `INSERT INTO products (id, slug, name, description, short_description, price_cents, currency, category,
      thumbnail_url, screenshots, features, external_url, is_real, active, sort_order, seo_title, seo_description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, body.slug.trim(), data.name!, data.description ?? null, data.short_description ?? null,
    data.price_cents ?? 0, data.category ?? null, data.thumbnail_url ?? null,
    JSON.stringify(data.screenshots ?? []), JSON.stringify(data.features ?? []),
    data.external_url ?? null, data.is_real ?? 0, data.active ?? 1, data.sort_order ?? 0,
    data.seo_title ?? null, data.seo_description ?? null, now, now
  ).run();
  return c.json({ ok: true, id }, 201);
});

// PUT /api/admin/products/:id — update
admin.put('/products/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const current = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
  if (!current) return c.json({ error: 'Product not found.' }, 404);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseProductInput(body);
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const data = parsed.data;
  if (data.slug) {
    const dup = await c.env.DB.prepare('SELECT id FROM products WHERE slug = ? AND id != ?').bind(data.slug, id).first();
    if (dup) return c.json({ error: 'A product with that slug already exists.' }, 409);
  }

  const merged = {
    slug: data.slug ?? String(current.slug),
    name: data.name ?? String(current.name),
    description: data.description ?? (current.description as string | null) ?? null,
    short_description: data.short_description ?? (current.short_description as string | null) ?? null,
    price_cents: data.price_cents ?? Number(current.price_cents),
    category: data.category ?? (current.category as string | null) ?? null,
    thumbnail_url: data.thumbnail_url ?? (current.thumbnail_url as string | null) ?? null,
    screenshots: data.screenshots ?? [],
    features: data.features ?? [],
    external_url: data.external_url ?? (current.external_url as string | null) ?? null,
    is_real: data.is_real ?? Number(current.is_real),
    active: data.active ?? Number(current.active),
    sort_order: data.sort_order ?? Number(current.sort_order),
    seo_title: data.seo_title ?? (current.seo_title as string | null) ?? null,
    seo_description: data.seo_description ?? (current.seo_description as string | null) ?? null,
  };
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  await c.env.DB.prepare(
    `UPDATE products SET
      slug = ?, name = ?, description = ?, short_description = ?, price_cents = ?, currency = 'USD',
      category = ?, thumbnail_url = ?, screenshots = ?, features = ?, external_url = ?,
      is_real = ?, active = ?, sort_order = ?, seo_title = ?, seo_description = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    merged.slug, merged.name, merged.description, merged.short_description, merged.price_cents,
    merged.category, merged.thumbnail_url, JSON.stringify(merged.screenshots), JSON.stringify(merged.features),
    merged.external_url, merged.is_real, merged.active, merged.sort_order,
    merged.seo_title, merged.seo_description, now, id
  ).run();
  return c.json({ ok: true });
});

// DELETE /api/admin/products/:id
admin.delete('/products/:id', requireAdmin, async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(c.req.param('id')).run();
  if (!result.meta.changes) return c.json({ error: 'Product not found.' }, 404);
  return c.json({ ok: true });
});

// POST /api/admin/seed-products — insert the 4 demo products (idempotent)
admin.post('/seed-products', requireAdmin, async (c) => {
  const count = await seedProducts(c.env.DB);
  return c.json({ ok: true, seeded: count });
});

// ---------- Orders ----------

// GET /api/admin/orders — newest first
admin.get('/orders', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM orders ORDER BY created_at DESC, id DESC'
  ).all();
  return c.json({ orders: results.map(mapOrder) });
});

// PATCH /api/admin/orders/:id { status?, notes? }
admin.patch('/orders/:id', requireAdmin, async (c) => {
  const order = await c.env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(c.req.param('id')).first();
  if (!order) return c.json({ error: 'Order not found.' }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { status?: string; notes?: string };
  if (body.status !== undefined && !(ORDER_STATUSES as readonly string[]).includes(body.status)) {
    return c.json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` }, 400);
  }
  const status = body.status ?? 'pending';
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  await c.env.DB.prepare('UPDATE orders SET status = ?, notes = ?, updated_at = ? WHERE id = ?')
    .bind(status, notes, now, c.req.param('id'))
    .run();
  return c.json({ ok: true });
});

export default admin;
