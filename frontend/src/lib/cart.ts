/**
 * cart.ts — localStorage mirror of the KV cart.
 *
 * The KV cart (via /api/cart/*) is the source of truth at checkout;
 * this mirror gives instant UI updates and survives Worker restarts.
 */
export interface LocalCartItem {
  product_id: string;
  qty: number;
}

export interface LocalCart {
  items: LocalCartItem[];
  cart_id: string | null;
}

const KEY = 'chq_cart';

export function getLocalCart(): LocalCart {
  if (typeof localStorage === 'undefined') return { items: [], cart_id: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { items: [], cart_id: null };
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return { items, cart_id: typeof parsed?.cart_id === 'string' ? parsed.cart_id : null };
  } catch {
    return { items: [], cart_id: null };
  }
}

export function saveLocalCart(cart: LocalCart): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent('chqcart', { detail: cart }));
}

export function addLocalItem(product_id: string, qty = 1): LocalCart {
  const cart = getLocalCart();
  const existing = cart.items.find((i) => i.product_id === product_id);
  if (existing) existing.qty = Math.min(existing.qty + qty, 99);
  else cart.items.push({ product_id, qty });
  saveLocalCart(cart);
  return cart;
}

export function updateLocalItem(product_id: string, qty: number): LocalCart {
  const cart = getLocalCart();
  cart.items =
    qty <= 0 ? cart.items.filter((i) => i.product_id !== product_id) : cart.items.map((i) => (i.product_id === product_id ? { ...i, qty } : i));
  saveLocalCart(cart);
  return cart;
}

export function removeLocalItem(product_id: string): LocalCart {
  const cart = getLocalCart();
  cart.items = cart.items.filter((i) => i.product_id !== product_id);
  saveLocalCart(cart);
  return cart;
}

export function clearLocalCart(): LocalCart {
  const cart: LocalCart = { items: [], cart_id: null };
  saveLocalCart(cart);
  return cart;
}

export function localCartCount(): number {
  return getLocalCart().items.reduce((sum, i) => sum + i.qty, 0);
}
