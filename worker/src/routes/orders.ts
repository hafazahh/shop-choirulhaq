/**
 * routes/orders.ts — public order endpoints (confirmation page).
 */
import { Hono } from 'hono';
import type { Env } from '../db';
import { getOrderById } from '../db';

const orders = new Hono<{ Bindings: Env }>();

// GET /api/orders/:id — order details for the confirmation page
orders.get('/:id', async (c) => {
  const order = await getOrderById(c.env.DB, c.req.param('id'));
  if (!order) return c.json({ error: 'Order not found' }, 404);
  return c.json({ order });
});

// POST /api/orders/:id/confirm-payment — "Saya sudah bayar" button.
// Status stays `pending`; the admin verifies and marks it `paid`.
orders.post('/:id/confirm-payment', async (c) => {
  const order = await getOrderById(c.env.DB, c.req.param('id'));
  if (!order) return c.json({ error: 'Order not found' }, 404);
  if (order.status !== 'pending') {
    return c.json({ error: `Order is ${order.status}; payment confirmation is no longer needed.` }, 400);
  }
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  await c.env.DB.prepare(
    "UPDATE orders SET payment_proof = 'customer_confirmed', updated_at = ? WHERE id = ?"
  ).bind(now, order.id).run();
  const updated = await getOrderById(c.env.DB, order.id);
  return c.json({ order: updated });
});

export default orders;
