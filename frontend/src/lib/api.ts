/**
 * api.ts — typed API client. Same origin: the Worker serves both the
 * static site and /api/*, so relative URLs work everywhere.
 */

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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  // products
  listProducts: () => request<{ products: Product[] }>('/api/products'),
  getProduct: (slug: string) => request<{ product: Product }>(`/api/products/${encodeURIComponent(slug)}`),

  // cart
  getCart: () => request<CartPayload>('/api/cart'),
  addToCart: (product_id: string, qty = 1) =>
    request<CartPayload>('/api/cart/add', { method: 'POST', body: JSON.stringify({ product_id, qty }) }),
  updateCartItem: (product_id: string, qty: number) =>
    request<CartPayload>('/api/cart/item', { method: 'PATCH', body: JSON.stringify({ product_id, qty }) }),
  removeCartItem: (product_id: string) =>
    request<CartPayload>(`/api/cart/item/${encodeURIComponent(product_id)}`, { method: 'DELETE' }),
  clearCart: () => request<CartPayload>('/api/cart', { method: 'DELETE' }),

  // checkout & orders
  checkout: (name: string, email: string, cart_id?: string) =>
    request<{ order: Order }>('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ name, email, cart_id }),
    }),
  getOrder: (id: string) => request<{ order: Order }>(`/api/orders/${encodeURIComponent(id)}`),
  confirmPayment: (id: string) =>
    request<{ order: Order }>(`/api/orders/${encodeURIComponent(id)}/confirm-payment`, { method: 'POST' }),

  // admin
  adminMe: () => request<{ ok: boolean }>('/api/admin/me'),
  adminLogin: (email: string, password: string) =>
    request<{ ok: true; email: string }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  adminLogout: () => request<{ ok: true }>('/api/admin/logout', { method: 'POST' }),
  adminListProducts: () => request<{ products: Product[] }>('/api/admin/products'),
  adminCreateProduct: (input: Record<string, unknown>) =>
    request<{ ok: true; id: string }>('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  adminUpdateProduct: (id: string, input: Record<string, unknown>) =>
    request<{ ok: true }>(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  adminDeleteProduct: (id: string) =>
    request<{ ok: true }>(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminListOrders: () => request<{ orders: Order[] }>('/api/admin/orders'),
  adminUpdateOrder: (id: string, input: { status?: string; notes?: string }) =>
    request<{ ok: true }>(`/api/admin/orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  adminSeedProducts: () => request<{ ok: true; seeded: number }>('/api/admin/seed-products', {
    method: 'POST',
  }),
};

export function formatPrice(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
