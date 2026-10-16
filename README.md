# shop.choirulhaq.com — Digital Product Shop MVP

Independent digital product shop with its own checkout flow, built exactly per
`/home/choirulhaq/Obsidian/20_projects/shop-digital-product/plan.md`.

**Stack:** Astro + Tailwind CSS v4 (frontend) · Cloudflare Worker + Hono (API ·
static hosting) · Cloudflare D1 (database) · Cloudflare KV (carts/sessions).
All free tier. Bilingual ID/EN from day one.

## Architecture

```
shop.choirulhaq.com → Cloudflare Worker (single domain, single deploy)
  /api/*            → Hono API (products, cart, checkout, orders, admin)
  /sitemap.xml      → generated from active D1 products
  everything else   → Astro build, served via the Worker's assets binding
```

The Worker serves the Astro build directly (assets binding in
`worker/wrangler.toml`) — no separate Pages project, no CORS, one deploy.
Clean URLs (`/product/<slug>`, `/order/<id>`, `/cart`, `/checkout`, `/admin`)
fall back to their static page shells.

Pages that need D1 data at build time (home, product detail) fetch the API
during `astro build` — so product pages ship real meta tags, canonical URLs,
OG tags, and JSON-LD in the static HTML. Cart/checkout/order/admin are
client-rendered against the API.

```
shop-choirulhaq/
├── frontend/                 # Astro app
│   ├── src/
│   │   ├── layouts/ShopLayout.astro
│   │   ├── pages/            # index, product/[slug], cart, checkout,
│   │   │                     # order/index, admin/index
│   │   ├── components/       # ProductCard, CartWidget, LanguageSwitcher
│   │   ├── lib/              # api.ts (typed client), cart.ts (localStorage
│   │   │                     # mirror), constants.ts (SITE_URL, bank info)
│   │   └── i18n/             # dictionaries.ts (flat, client switcher)
│   │                         # + id.ts / en.ts (nested) + index.ts (t())
│   └── astro.config.mjs      # site = https://shop.choirulhaq.com
├── worker/
│   ├── src/
│   │   ├── index.ts          # routing, sitemap, security headers, static fallback
│   │   ├── db.ts             # Env bindings, row mapping
│   │   ├── auth.ts           # scrypt hashing, D1 sessions, cookies
│   │   ├── seed.ts           # demo-product seeder (seed-data.json)
│   │   ├── schema.sql
│   │   ├── seed-data.json    # shared source for Worker + scripts/seed.mjs
│   │   └── routes/           # products, cart, checkout, orders, admin
│   └── wrangler.toml         # DB, CART_KV, ASSETS bindings
├── scripts/seed.mjs          # one-shot schema + products + admin user
└── README.md
```

## Local development

**Prerequisites:** Node ≥ 22, wrangler CLI (`npm i -g wrangler`).

```bash
cd /home/choirulhaq/venvProject/shop-choirulhaq
npm run setup                 # install frontend + worker deps
npm run db:setup              # create + seed local D1 (prints admin password!)
```

`npm run db:setup` applies the schema, inserts the 4 demo products, and creates
the admin user (`admin@choirulhaq.com`) with a **randomly generated password
printed to the console once**. Save it. (Rerun with `ADMIN_PASSWORD=...` to
rotate, or `ADMIN_EMAIL=...` to change the email.)

```bash
# terminal 1 — API + static serving on http://localhost:8787
npm run dev:worker            # wrangler dev (local D1 + KV)

# terminal 2 (optional, after first build) — Astro dev server for HMR
cd frontend && npm run dev
```

The Worker serves the Astro **build**, so rebuild after frontend changes:

```bash
npm run build                 # reads products from the running Worker API
npm run dev:worker            # restart to pick up the new dist
```

`SHOP_API_ORIGIN` (default `http://localhost:8787`) controls where `astro
build` fetches products from — set it to your live Worker URL before a
production build.

## Verification checklist

```bash
# storefront (static HTML with real product data)
curl -s http://localhost:8787/ | grep -o 'LogicSim Pro' | head -1
curl -s http://localhost:8787/product/logic-sim-pro | grep -o 'application/ld+json'
curl -s http://localhost:8787/sitemap.xml

# API
curl -s http://localhost:8787/api/products
curl -s -X POST http://localhost:8787/api/cart/add \
  -H 'Content-Type: application/json' -d '{"product_id":"p_logicsim"}'
# → 400: demo products can't be added (per plan Q3). Checkout is only
# reachable for products with is_real=1 — flip one via admin to test the
# full flow, or seed one from the admin panel.
```

i18n audit (both languages must render real text, not raw keys):

```bash
npm run build
grep -roh 'data-i18n="[^"]*"' frontend/dist | sort -u   # every key must exist
grep -c 'data-i18n' frontend/dist/index.html              # > 0
```

## Deployment (you handle Cloudflare credentials)

1. **Create resources** (each command updates `worker/wrangler.toml`):
   ```bash
   cd worker
   wrangler d1 create shop-db
   wrangler kv namespace create CART_KV
   ```
2. **Set env vars** (`wrangler secret` / `wrangler deployments` env):
   - `ENVIRONMENT=production` — makes session cookies `Secure`
   - `SITE_URL=https://shop.choirulhaq.com` — used for sitemap URLs
3. **Seed the production DB:**
   ```bash
   node ../scripts/seed.mjs --remote
   ```
4. **Build the frontend against the live API**, then deploy:
   ```bash
   cd ..
   SHOP_API_ORIGIN=https://shop.choirulhaq.com npm run build
   npm --prefix worker run deploy
   ```
5. **DNS:** CNAME `shop` → the Worker. Either enable `workers_dev` in
   `wrangler.toml` (default `*.workers.dev` URL) or add:
   ```toml
   route = { pattern = "shop.choirulhaq.com/*", zone_name = "choirulhaq.com" }
   ```
6. **Admin:** sign in at `https://shop.choirulhaq.com/admin` with the
   email/password from the seed step.

## API reference

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/products` | — | Active products |
| GET | `/api/products/:slug` | — | Single product |
| GET | `/api/cart` | — | Current cart (KV) |
| POST | `/api/cart/add` | — | Add item (real products only) |
| PATCH | `/api/cart/item` | — | Set qty (≤0 removes) |
| DELETE | `/api/cart/item/:product_id` | — | Remove item |
| DELETE | `/api/cart` | — | Clear cart |
| POST | `/api/checkout` | — | Create order (name, email, cart_id) |
| GET | `/api/orders/:id` | — | Order details |
| POST | `/api/orders/:id/confirm-payment` | — | "Saya sudah bayar" |
| POST | `/api/admin/login` | — | Email + password → session cookie |
| POST | `/api/admin/logout` | session | Destroy session |
| GET | `/api/admin/me` | session | Check session |
| GET/POST | `/api/admin/products` | session | List / create |
| PUT/DELETE | `/api/admin/products/:id` | session | Update / delete |
| GET | `/api/admin/orders` | session | List orders |
| PATCH | `/api/admin/orders/:id` | session | Update status / notes |
| POST | `/api/admin/seed-products` | session | Insert 4 demo products |

## Checkout flow (MVP — manual bank transfer)

1. Customer adds a **real** product (`is_real=1`) to the cart → KV + cookie
2. Checkout form (name, email) → order created in D1, status `pending`
3. Confirmation page shows order ID + bank account details
4. Customer clicks **"Saya sudah bayar"** → `payment_proof` recorded
5. Admin verifies the transfer in `/admin` → status `paid` → delivers the
   product (download link by email) → status `delivered`

⚠️ **Before launch:** fill in your real bank accounts in
`frontend/src/lib/constants.ts` (`BANK_ACCOUNTS` — currently placeholders).

## Security

- Admin passwords: PBKDF2-SHA256 (600,000 iterations), Web Crypto
- Sessions: random UUID in D1, 7-day expiry, HttpOnly SameSite=Lax cookies
  (`Secure` in production)
- All SQL parameterized; Astro escapes output by default
- Security headers on every response (nosniff, frame-deny, referrer-policy)
- Login runs a dummy hash comparison to blunt user-enumeration timing
- CSRF: same-origin API only

## Roadmap (from plan.md)

- **Phase 2:** "Buy on Gumroad" external links for SEO backlinks (LogicSim
  already has one), Stripe checkout, email notifications, discount codes
- **Phase 3:** buyer accounts, subscriptions, affiliates, public API

## i18n note

`src/i18n/dictionaries.ts` (flat) powers the client switcher via `data-i18n`
attributes — the same pattern as the profile site. `id.ts`/`en.ts` (nested)
mirror the same strings for `t()` lookups. When adding a UI string: add the
key to **both** language blocks of `dictionaries.ts` (and the nested files),
with real fallback text in the markup — a key in only one language silently
renders the raw key for the other.
