/**
 * routes/products.ts — public product endpoints.
 */
import { Hono } from 'hono';
import type { Env } from '../db';
import { getProductBySlug, listActiveProducts } from '../db';

const products = new Hono<{ Bindings: Env }>();

// GET /api/products — active products, ordered for the storefront
products.get('/', async (c) => {
  const items = await listActiveProducts(c.env.DB);
  return c.json({ products: items });
});

// GET /api/products/:slug — single active product
products.get('/:slug', async (c) => {
  const product = await getProductBySlug(c.env.DB, c.req.param('slug'));
  if (!product) return c.json({ error: 'Product not found' }, 404);
  return c.json({ product });
});

export default products;
