/**
 * routes/cart.ts — KV-backed cart.
 *
 * Cart id lives in a `cart_id` cookie (auto-issued on first cart call).
 * The frontend mirrors items in localStorage for instant UI; this API is
 * the source of truth at checkout.
 */
import { Hono } from 'hono';
import type { Env } from '../db';
import { getProductById, type CartLine, type CartPayload } from '../db';
import { parseCookies } from '../auth';

const COOKIE = 'cart_id';
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_QTY = 99;

const cart = new Hono<{ Bindings: Env }>();

function readCartItems(env: Env, cartId: string): Promise<Array<{ product_id: string; qty: number }>> {
  return env.CART_KV.get(`cart:${cartId}`).then((raw) => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((i: any) => i && typeof i.product_id === 'string') : [];
    } catch {
      return [];
    }
  });
}

async function writeCartItems(env: Env, cartId: string, items: Array<{ product_id: string; qty: number }>): Promise<void> {
  await env.CART_KV.put(`cart:${cartId}`, JSON.stringify(items), { expirationTtl: TTL_SECONDS });
}

function cartCookieHeader(cartId: string): string {
  return `${COOKIE}=${cartId}; Path=/; Max-Age=${TTL_SECONDS}; SameSite=Lax`;
}

function parseQty(raw: unknown, fallback: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, MAX_QTY);
}

async function buildPayload(env: Env, cartId: string): Promise<CartPayload> {
  const items = await readCartItems(env, cartId);
  const lines: CartLine[] = [];
  let total = 0;
  let count = 0;
  for (const item of items) {
    const product = await getProductById(env.DB, item.product_id);
    if (!product || !product.active) continue;
    const lineTotal = product.price_cents * item.qty;
    lines.push({
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      price_cents: product.price_cents,
      currency: product.currency,
      qty: item.qty,
      line_total: lineTotal,
    });
    total += lineTotal;
    count += item.qty;
  }
  return { cart_id: cartId, items: lines, total_cents: total, item_count: count };
}

// GET /api/cart — current cart (join with product rows)
cart.get('/', async (c) => {
  const cookies = parseCookies(c.req.header('cookie'));
  const cartId = cookies[COOKIE];
  if (!cartId) return c.json({ cart_id: null, items: [], total_cents: 0, item_count: 0 });
  const payload = await buildPayload(c.env, cartId);
  return c.json(payload);
});

// POST /api/cart/add  { product_id, qty? } — only real products can be added
cart.post('/add', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { product_id?: string; qty?: unknown };
  const productId = typeof body.product_id === 'string' ? body.product_id : '';
  if (!productId) return c.json({ error: 'product_id is required' }, 400);

  const product = await getProductById(c.env.DB, productId);
  if (!product || !product.active) return c.json({ error: 'Product not found' }, 404);
  if (!product.is_real) {
    return c.json({ error: `${product.name} is coming soon and cannot be added to the cart yet.` }, 400);
  }

  const cookies = parseCookies(c.req.header('cookie'));
  let cartId = cookies[COOKIE];
  const isNew = !cartId;
  if (!cartId) cartId = crypto.randomUUID();

  const items = await readCartItems(c.env, cartId);
  const existing = items.find((i) => i.product_id === productId);
  const addQty = parseQty(body.qty, 1);
  if (existing) {
    existing.qty = Math.min(existing.qty + addQty, MAX_QTY);
  } else {
    items.push({ product_id: productId, qty: addQty });
  }
  await writeCartItems(c.env, cartId!, items);

  // NOTE: in Hono v4 the header must go on c.res and the handler must return
  // c.res — returning the raw c.json() object drops headers set afterwards.
  c.json(await buildPayload(c.env, cartId!));
  if (isNew) c.header('Set-Cookie', cartCookieHeader(cartId!), { append: true });
  return c.res;
});

// PATCH /api/cart/item  { product_id, qty } — qty <= 0 removes the item
cart.patch('/item', async (c) => {
  const cookies = parseCookies(c.req.header('cookie'));
  const cartId = cookies[COOKIE];
  if (!cartId) return c.json({ error: 'No cart' }, 400);

  const body = (await c.req.json().catch(() => ({}))) as { product_id?: string; qty?: unknown };
  const productId = typeof body.product_id === 'string' ? body.product_id : '';
  if (!productId) return c.json({ error: 'product_id is required' }, 400);

  const items = await readCartItems(c.env, cartId);
  const qty = parseQty(body.qty, 0);
  const next = qty <= 0
    ? items.filter((i) => i.product_id !== productId)
    : items.map((i) => (i.product_id === productId ? { ...i, qty } : i));
  await writeCartItems(c.env, cartId, next);
  return c.json(await buildPayload(c.env, cartId));
});

// DELETE /api/cart/item/:product_id
cart.delete('/item/:product_id', async (c) => {
  const cookies = parseCookies(c.req.header('cookie'));
  const cartId = cookies[COOKIE];
  if (!cartId) return c.json({ error: 'No cart' }, 400);
  const items = (await readCartItems(c.env, cartId)).filter(
    (i) => i.product_id !== c.req.param('product_id')
  );
  await writeCartItems(c.env, cartId, items);
  return c.json(await buildPayload(c.env, cartId));
});

// DELETE /api/cart — clear the whole cart
cart.delete('/', async (c) => {
  const cookies = parseCookies(c.req.header('cookie'));
  const cartId = cookies[COOKIE];
  if (cartId) await writeCartItems(c.env, cartId, []);
  return c.json({ cart_id: cartId ?? null, items: [], total_cents: 0, item_count: 0 });
});

export default cart;
