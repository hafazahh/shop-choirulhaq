# Task Plan — Deploy Production shop.choirulhaq.com

## Goal
Deploy MVP ke production: D1 + KV bindings, env vars, custom domain, deploy Worker.

## Status: ✅ COMPLETE

### Phase 1: Auth Cloudflare — ✅
- wrangler login via device flow (localhost callback gak jalan di container)

### Phase 2: D1 Database — ✅
- `wrangler d1 create shop-db` → `aebe9961-59ca-4000-a6c0-b89aab1cee3d`

### Phase 3: KV Namespace — ✅
- `wrangler kv namespace create CART_KV` → `574020d858b54e4489ae7dd944e67e76`

### Phase 4: Config wrangler.toml — ✅
- D1 + KV bindings updated with real IDs
- `[vars]` ENVIRONMENT=production, SITE_URL set
- Custom domain set via dashboard (route via wrangler.toml gak jalan)

### Phase 5: Seed Production DB — ✅
- `node ../scripts/seed.mjs --remote` — schema + 4 produk + admin user

### Phase 6: Build Frontend — ✅
- `SHOP_API_ORIGIN=https://shop.choirulhaq.com npm run build` — 9 pages

### Phase 7: Deploy Worker — ✅
- `wrangler deploy` — live at shop.choirulhaq.com

### Phase 8: Verify — ✅
- Homepage: produk tampil ✓
- Product page: LogicSim Pro, $29, JSON-LD ✓
- API: /api/products 200 ✓
- Admin login: ✓ (after PBKDF2 fix)

## Bugs Fixed
1. **PBKDF2 iterations** — workerd cap 100k, code pakai 600k → login 401. Fixed to 100k.
2. **Route syntax** — `route` (singular) gak jalan, harus set via dashboard.
3. **is_real LogicSim** — seed data pakai 0, updated to 1 via D1 query.

## Admin Credentials
- URL: https://shop.choirulhaq.com/admin
- Email: admin@choirulhaq.com
- Password: 1e0a29ff95441f0d67b9 (hash: pbkdf2$100000$...)

## Production URLs
- Shop: https://shop.choirulhaq.com
- Workers: https://shop-worker.choirulhaq.workers.dev
- Admin: https://shop.choirulhaq.com/admin
