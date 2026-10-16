/**
 * index.ts — Worker entry point.
 *
 * Routes:
 *   /api/*   → Hono API (products, cart, checkout, orders, admin)
 *   /sitemap.xml → generated from active products in D1
 *   everything else → Astro static build (via ASSETS binding)
 *
 * Clean-URL fallback: /product/<slug>, /order/<id>, /cart, /checkout
 * and /admin all serve their static index.html shells; the pages read
 * the id from the pathname client-side.
 */
import { Hono } from 'hono';
import type { Env } from './db';
import { listActiveProducts, securityHeaders } from './db';
import productsRoute from './routes/products';
import cartRoute from './routes/cart';
import checkoutRoute from './routes/checkout';
import ordersRoute from './routes/orders';
import adminRoute from './routes/admin';

const app = new Hono<{ Bindings: Env }>();

// Security headers on every API response (plan §10). Mutate headers in
// place after next() — rebuilding the Response can drop the body stream.
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'same-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

// API 404 (must come after all API mounts)
app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.body(null, 404);
});

app.route('/api/products', productsRoute);
app.route('/api/cart', cartRoute);
app.route('/api/checkout', checkoutRoute);
app.route('/api/orders', ordersRoute);
app.route('/api/admin', adminRoute);

// Clean-URL → static shell mapping (order matters: longest prefix first).
// Dynamic segments must NOT require a trailing slash, otherwise the assets
// binding would 307-redirect (e.g. /product/x → /product/x/) first.
const SHELL_FALLBACKS: Array<[RegExp, string]> = [
  [/^\/product\/[^/]+$/, '/product/index.html'],
  [/^\/product\//, '/product/index.html'],
  [/^\/order\/[^/]+$/, '/order/index.html'],
  [/^\/order\//, '/order/index.html'],
  [/^\/cart\/?$/, '/cart/index.html'],
  [/^\/checkout\/?$/, '/checkout/index.html'],
  [/^\/admin\/?$/, '/admin/index.html'],
  [/^\/admin\//, '/admin/index.html'],
];

function shellFor(pathname: string): string | null {
  for (const [pattern, shell] of SHELL_FALLBACKS) {
    if (pattern.test(pathname)) return shell;
  }
  return null;
}

async function buildSitemap(env: Env): Promise<string> {
  const site = (env.SITE_URL || 'https://shop.choirulhaq.com').replace(/\/$/, '');
  const products = await listActiveProducts(env.DB);
  const urls = [
    `  <url><loc>${site}</loc><changefreq>weekly</changefreq></url>`,
    ...products.map(
      (p) =>
        `  <url><loc>${site}/product/${p.slug}</loc><lastmod>${(p.updated_at || p.created_at).slice(0, 10)}</lastmod><changefreq>monthly</changefreq></url>`
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // API
    if (path.startsWith('/api/')) {
      return app.fetch(request, env);
    }

    // Sitemap
    if (path === '/sitemap.xml') {
      const xml = await buildSitemap(env);
      return securityHeaders(new Response(xml, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      }));
    }

    // Clean-URL shells
    const shell = shellFor(path);
    if (shell) {
      const shellRequest = new Request(new URL(shell, request.url), request);
      const res = await env.ASSETS.fetch(shellRequest);
      if (res.status !== 404) return securityHeaders(res);
    }

    // Everything else: static assets as-is (/, /favicon.svg, /robots.txt, ...)
    const res = await env.ASSETS.fetch(request);
    return securityHeaders(res);
  },
};
