/**
 * routes/checkout.ts — manual bank-transfer checkout.
 *
 * Creates a `pending` order from the KV cart, then clears the cart.
 * The customer pays by bank transfer and confirms on the order page;
 * the admin later marks the order paid/delivered in /admin.
 */
import { Hono } from 'hono';
import type { Env } from '../db';
import { getProductById, type Order, type OrderItem } from '../db';
import { parseCookies } from '../auth';

const checkout = new Hono<{ Bindings: Env }>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/checkout  { name, email, cart_id? }
checkout.post('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    cart_id?: string;
  };

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (name.length < 2) return c.json({ error: 'Please enter your full name.' }, 400);
  if (!EMAIL_RE.test(email)) return c.json({ error: 'Please enter a valid email address.' }, 400);

  // Cart id: explicit body value (frontend mirror) or cookie
  const cookies = parseCookies(c.req.header('cookie'));
  const cartId = typeof body.cart_id === 'string' && body.cart_id ? body.cart_id : cookies['cart_id'];
  if (!cartId) return c.json({ error: 'Your cart is empty.' }, 400);

  const rawItems = await c.env.CART_KV.get(`cart:${cartId}`).then((raw): Array<{ product_id: string; qty: number }> => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  if (rawItems.length === 0) return c.json({ error: 'Your cart is empty.' }, 400);

  // Validate every line against D1 — server-side totals only
  const orderItems: OrderItem[] = [];
  const blocked: string[] = [];
  let totalCents = 0;
  for (const item of rawItems) {
    const product = await getProductById(c.env.DB, item.product_id);
    if (!product || !product.active) {
      return c.json({ error: 'A product in your cart is no longer available.' }, 400);
    }
    if (!product.is_real) {
      blocked.push(product.name);
      continue;
    }
    const qty = Math.max(1, Math.min(Math.floor(Number(item.qty)) || 1, 99));
    orderItems.push({ product_id: product.id, name: product.name, price_cents: product.price_cents, qty });
    totalCents += product.price_cents * qty;
  }
  if (blocked.length > 0) {
    return c.json(
      { error: `Coming soon: ${blocked.join(', ')} cannot be purchased yet. Remove them from your cart to check out.` },
      400
    );
  }
  if (orderItems.length === 0) return c.json({ error: 'Your cart is empty.' }, 400);

  const orderId = `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  await c.env.DB.prepare(
    `INSERT INTO orders (id, customer_email, customer_name, items, total_cents, currency, status, payment_method, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'USD', 'pending', 'manual_bank_transfer', ?, ?)`
  ).bind(orderId, email, name, JSON.stringify(orderItems), totalCents, now, now).run();

  // Order created — the cart is consumed
  await c.env.CART_KV.delete(`cart:${cartId}`);

  const order: Order = {
    id: orderId,
    customer_email: email,
    customer_name: name,
    items: orderItems,
    total_cents: totalCents,
    currency: 'USD',
    status: 'pending',
    payment_method: 'manual_bank_transfer',
    payment_proof: null,
    notes: null,
    created_at: now,
    updated_at: now,
  };
  return c.json({ order }, 201);
});

export default checkout;
