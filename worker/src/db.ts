/**
 * db.ts — Env bindings, row mapping, shared query helpers.
 */
import type { Context } from 'hono';

export interface Env {
  DB: D1Database;
  CART_KV: KVNamespace;
  ASSETS: Fetcher;
  ENVIRONMENT: string; // "production" when deployed via wrangler deploy
  SITE_URL: string; // canonical site URL, e.g. https://shop.choirulhaq.com
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  short_description: string | null;
  price_cents: number;
  currency: string;
  category: string | null;
  thumbnail_url: string | null;
  screenshots: string[];
  features: string[];
  external_url: string | null;
  is_real: number;
  active: number;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  product_id: string;
  name: string;
  price_cents: number;
  qty: number;
}

export interface Order {
  id: string;
  customer_email: string;
  customer_name: string | null;
  items: OrderItem[];
  total_cents: number;
  currency: string;
  status: string;
  payment_method: string;
  payment_proof: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartLine {
  product_id: string;
  name: string;
  slug: string;
  price_cents: number;
  currency: string;
  qty: number;
  line_total: number;
}

export interface CartPayload {
  cart_id: string;
  items: CartLine[];
  total_cents: number;
  item_count: number;
}

type Row = Record<string, unknown>;

function jsonArray(value: unknown, fallback: string[] = []): string[] {
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function mapProduct(row: Row): Product {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: (row.description as string) ?? null,
    short_description: (row.short_description as string) ?? null,
    price_cents: Number(row.price_cents) || 0,
    currency: String(row.currency ?? 'USD'),
    category: (row.category as string) ?? null,
    thumbnail_url: (row.thumbnail_url as string) ?? null,
    screenshots: jsonArray(row.screenshots),
    features: jsonArray(row.features),
    external_url: (row.external_url as string) ?? null,
    is_real: Number(row.is_real ?? 0),
    active: Number(row.active ?? 1),
    sort_order: Number(row.sort_order ?? 0),
    seo_title: (row.seo_title as string) ?? null,
    seo_description: (row.seo_description as string) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

export function mapOrder(row: Row): Order {
  let items: OrderItem[] = [];
  try {
    const parsed = JSON.parse(String(row.items));
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    items = [];
  }
  return {
    id: String(row.id),
    customer_email: String(row.customer_email),
    customer_name: (row.customer_name as string) ?? null,
    items,
    total_cents: Number(row.total_cents) || 0,
    currency: String(row.currency ?? 'USD'),
    status: String(row.status ?? 'pending'),
    payment_method: String(row.payment_method ?? 'manual_bank_transfer'),
    payment_proof: (row.payment_proof as string) ?? null,
    notes: (row.notes as string) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

export async function listActiveProducts(db: D1Database): Promise<Product[]> {
  const { results } = await db
    .prepare(
      'SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC, created_at ASC'
    )
    .all();
  return results.map(mapProduct);
}

export async function getProductBySlug(db: D1Database, slug: string): Promise<Product | null> {
  const row = await db
    .prepare('SELECT * FROM products WHERE slug = ? AND active = 1')
    .bind(slug)
    .first();
  return row ? mapProduct(row) : null;
}

export async function getProductById(db: D1Database, id: string): Promise<Product | null> {
  const row = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
  return row ? mapProduct(row) : null;
}

export async function getOrderById(db: D1Database, id: string): Promise<Order | null> {
  const row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  return row ? mapOrder(row) : null;
}

export function isProd(env: Env): boolean {
  return env.ENVIRONMENT === 'production';
}

/** Add baseline security headers to any response (plan §10). */
export function securityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export function badRequest(c: Context, message: string): Response {
  return c.json({ error: message }, 400);
}
