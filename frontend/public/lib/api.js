// api.ts — browser-compatible version (types stripped)
export async function request(path, init) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  listProducts: () => request('/api/products'),
  getProduct: (slug) => request(`/api/products/${encodeURIComponent(slug)}`),
  getCart: () => request('/api/cart'),
  addToCart: (product_id, qty = 1) =>
    request('/api/cart/add', { method: 'POST', body: JSON.stringify({ product_id, qty }) }),
  updateCartItem: (product_id, qty) =>
    request('/api/cart/item', { method: 'PATCH', body: JSON.stringify({ product_id, qty }) }),
  removeCartItem: (product_id) =>
    request(`/api/cart/item/${encodeURIComponent(product_id)}`, { method: 'DELETE' }),
  clearCart: () => request('/api/cart', { method: 'DELETE' }),
  checkout: (name, email, cart_id) =>
    request('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ name, email, cart_id }),
    }),
  getOrder: (id) => request(`/api/orders/${encodeURIComponent(id)}`),
  confirmPayment: (id) =>
    request(`/api/orders/${encodeURIComponent(id)}/confirm-payment`, { method: 'POST' }),
  adminMe: () => request('/api/admin/me'),
  adminLogin: (email, password) =>
    request('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  adminLogout: () => request('/api/admin/logout', { method: 'POST' }),
  adminListProducts: () => request('/api/admin/products'),
  adminCreateProduct: (input) =>
    request('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  adminUpdateProduct: (id, input) =>
    request(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  adminDeleteProduct: (id) =>
    request(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminListOrders: () => request('/api/admin/orders'),
  adminUpdateOrder: (id, input) =>
    request(`/api/admin/orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  adminSeedProducts: () => request('/api/admin/seed-products', {
    method: 'POST',
  }),
};

export function formatPrice(cents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
