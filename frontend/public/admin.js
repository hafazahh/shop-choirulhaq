// admin.js — plain JS for admin panel (no imports, classic script compatible)

const ADMIN_EMAIL = 'admin@choirulhaq.com';

async function request(path, init) {
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

const api = {
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

function formatPrice(cents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

const root = document.getElementById('admin-root');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const emptyProduct = {
  name: '', slug: '', description: '', short_description: '', price_cents: 0,
  category: '', thumbnail_url: '', features: [], screenshots: [], external_url: '',
  is_real: 0, active: 1, sort_order: 0, seo_title: '', seo_description: '',
};

// ---------- Login ----------

function renderLogin(error = '') {
  root.innerHTML = `
    <div class="mx-auto max-w-sm">
      <div class="card p-8">
        <h1 class="mb-1 text-2xl font-extrabold text-gray-900">Admin Panel</h1>
        <p class="mb-6 text-sm text-gray-500">Masuk untuk mengelola produk dan pesanan</p>
        <form id="login-form" class="flex flex-col gap-4">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700">Email</label>
            <input id="email" type="email" required class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" value="${ADMIN_EMAIL}" autocomplete="username" />
          </div>
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700">Kata Sandi</label>
            <input id="password" type="password" required class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" autocomplete="current-password" />
          </div>
          <button type="submit" id="login-btn" class="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700">Masuk</button>
          ${error ? `<p class="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">${esc(error)}</p>` : ''}
        </form>
      </div>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Memproses…';
    try {
      await api.adminLogin(
        document.getElementById('email').value,
        document.getElementById('password').value
      );
      await boot();
    } catch (err) {
      renderLogin(err instanceof Error ? err.message : 'Login failed');
    }
  });
}

// ---------- Dashboard ----------

let productsCache = [];
let ordersCache = [];
let editingId = null;

function renderDashboard() {
  root.innerHTML = `
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold text-gray-900">Selamat datang kembali</h1>
        <p class="text-sm text-gray-500">Admin Panel</p>
      </div>
      <button id="logout-btn" class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Keluar</button>
    </div>
    <div class="mb-6 flex gap-2 border-b border-gray-200">
      <button id="tab-products" class="border-b-2 border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700">Produk</button>
      <button id="tab-orders" class="border-b-2 border-transparent px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700">Pesanan</button>
    </div>
    <section id="panel-products"></section>
    <section id="panel-orders" class="hidden"></section>`;

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api.adminLogout();
    renderLogin();
  });
  document.getElementById('tab-products').addEventListener('click', () => switchTab('products'));
  document.getElementById('tab-orders').addEventListener('click', () => switchTab('orders'));
  switchTab('products');
}

function switchTab(tab) {
  document.getElementById('tab-products').className = `border-b-2 ${tab === 'products' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'} px-4 py-2 text-sm font-semibold`;
  document.getElementById('tab-orders').className = `border-b-2 ${tab === 'orders' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'} px-4 py-2 text-sm font-semibold`;
  document.getElementById('panel-products').classList.toggle('hidden', tab !== 'products');
  document.getElementById('panel-orders').classList.toggle('hidden', tab !== 'orders');
  if (tab === 'products') renderProducts();
  else renderOrders();
}

// ---------- Products tab ----------

function productForm(p = emptyProduct) {
  return `
    <form id="product-form" class="card flex flex-col gap-3 p-6">
      <h3 class="font-bold text-gray-900">${editingId ? 'Edit Produk' : 'Tambah Produk'}</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-gray-700">Nama Produk</label>
          <input id="pf-name" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" required value="${esc(p.name)}" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">Slug</label>
          <input id="pf-slug" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" required pattern="[a-z0-9-]+" value="${esc(p.slug)}" ${editingId ? 'disabled' : ''} />
          <p class="mt-1 text-xs text-gray-400">untuk URL /product/&lt;slug&gt;</p>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-gray-700">Harga (USD, sen)</label>
          <input id="pf-price" type="number" min="0" step="1" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" value="${p.price_cents}" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">Kategori</label>
          <input id="pf-category" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" value="${esc(p.category ?? '')}" placeholder="software / templates / ebooks" />
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700">Deskripsi Singkat</label>
        <input id="pf-short" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" value="${esc(p.short_description ?? '')}" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700">Deskripsi</label>
        <textarea id="pf-desc" rows="3" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2">${esc(p.description ?? '')}</textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700">Fitur (satu per baris)</label>
        <textarea id="pf-features" rows="3" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2">${esc((p.features ?? []).join('\n'))}</textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700">Screenshot (satu URL per baris)</label>
        <textarea id="pf-screens" rows="2" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2">${esc((p.screenshots ?? []).join('\n'))}</textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700">URL External (Gumroad, dll)</label>
        <input id="pf-external" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" value="${esc(p.external_url ?? '')}" />
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-gray-700">SEO Title</label>
          <input id="pf-seo-title" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" value="${esc(p.seo_title ?? '')}" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">SEO Description</label>
          <input id="pf-seo-desc" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" value="${esc(p.seo_description ?? '')}" />
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-5">
        <label class="flex items-center gap-2 text-sm text-gray-700">
          <input id="pf-real" type="checkbox" ${p.is_real ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300" />
          <span>Produk Bisa Dibeli (bukan demo)</span>
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-700">
          <input id="pf-active" type="checkbox" ${p.active ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300" />
          <span>Aktif</span>
        </label>
      </div>
      <div class="flex gap-3">
        <button type="submit" class="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700">Simpan</button>
        ${editingId ? '<button type="button" id="pf-cancel" class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Batal</button>' : ''}
      </div>
      <p id="pf-error" class="hidden rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"></p>
    </form>`;
}

function renderProducts() {
  const panel = document.getElementById('panel-products');
  panel.innerHTML = `
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-bold text-gray-900">Produk</h2>
      <button id="seed-btn" class="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50">🌱 Seed Produk Demo</button>
    </div>
    <div class="mb-6" id="form-slot"></div>
    <div class="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table class="min-w-full divide-y divide-gray-200 text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th class="px-4 py-3">Nama Produk</th>
            <th class="px-4 py-3">Harga (USD, sen)</th>
            <th class="px-4 py-3">Kategori</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${productsCache.length === 0 ? '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">Belum ada produk.</td></tr>' : ''}
          ${productsCache.map((p) => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <a href="/product/${p.slug}" target="_blank" class="font-medium text-brand-600 hover:underline">${esc(p.name)}</a>
                <span class="block text-xs text-gray-400">/product/${esc(p.slug)}</span>
              </td>
              <td class="px-4 py-3">${formatPrice(p.price_cents, p.currency)}</td>
              <td class="px-4 py-3">${esc(p.category ?? '—')}</td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  ${!p.active ? '<span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">inactive</span>' : '<span class="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">active</span>'}
                  ${p.is_real ? '<span class="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">purchasable</span>' : '<span class="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">coming soon</span>'}
                </div>
              </td>
              <td class="px-4 py-3 text-right">
                <button class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 pf-edit" data-id="${p.id}">✏️ Edit</button>
                <button class="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 pf-del" data-id="${p.id}">🗑 Hapus</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const formSlot = document.getElementById('form-slot');
  formSlot.innerHTML = productForm(editingId ? productsCache.find((p) => p.id === editingId) ?? emptyProduct : emptyProduct);
  wireProductForm();

  panel.querySelectorAll('.pf-edit').forEach((btn) =>
    btn.addEventListener('click', () => {
      editingId = btn.getAttribute('data-id');
      renderProducts();
      document.getElementById('form-slot').scrollIntoView({ behavior: 'smooth' });
    })
  );

  panel.querySelectorAll('.pf-del').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this product?')) return;
      try {
        await api.adminDeleteProduct(btn.getAttribute('data-id'));
        await refreshProducts();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Delete failed');
      }
    })
  );

  document.getElementById('seed-btn').addEventListener('click', async () => {
    if (!confirm('Seed the 4 demo products? Existing demo rows are updated.')) return;
    try {
      const res = await api.adminSeedProducts();
      alert(res.seeded + ' demo products seeded.');
      await refreshProducts();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Seed failed');
    }
  });
}

function wireProductForm() {
  const form = document.getElementById('product-form');
  const errBox = document.getElementById('pf-error');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errBox.classList.add('hidden');
    const input = {
      name: document.getElementById('pf-name').value,
      price_cents: Number(document.getElementById('pf-price').value) || 0,
      category: document.getElementById('pf-category').value || null,
      short_description: document.getElementById('pf-short').value || null,
      description: document.getElementById('pf-desc').value || null,
      features: document.getElementById('pf-features').value.split('\n').map((s) => s.trim()).filter(Boolean),
      screenshots: document.getElementById('pf-screens').value.split('\n').map((s) => s.trim()).filter(Boolean),
      external_url: document.getElementById('pf-external').value || null,
      seo_title: document.getElementById('pf-seo-title').value || null,
      seo_description: document.getElementById('pf-seo-desc').value || null,
      is_real: document.getElementById('pf-real').checked ? 1 : 0,
      active: document.getElementById('pf-active').checked ? 1 : 0,
    };
    try {
      if (editingId) {
        await api.adminUpdateProduct(editingId, input);
        editingId = null;
      } else {
        input.slug = document.getElementById('pf-slug').value;
        await api.adminCreateProduct(input);
        editingId = null;
      }
      await refreshProducts();
    } catch (err) {
      errBox.textContent = err instanceof Error ? err.message : 'Save failed';
      errBox.classList.remove('hidden');
    }
  });
  document.getElementById('pf-cancel')?.addEventListener('click', () => {
    editingId = null;
    renderProducts();
  });
}

async function refreshProducts() {
  const res = await api.adminListProducts();
  productsCache = res.products;
  renderProducts();
}

// ---------- Orders tab ----------

function renderOrders() {
  const panel = document.getElementById('panel-orders');
  panel.innerHTML = `
    <h2 class="mb-4 text-lg font-bold text-gray-900">Pesanan</h2>
    <div class="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table class="min-w-full divide-y divide-gray-200 text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th class="px-4 py-3">ID Pesanan</th>
            <th class="px-4 py-3">Pembeli</th>
            <th class="px-4 py-3">Total</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Tanggal</th>
            <th class="px-4 py-3 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${ordersCache.length === 0 ? '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">Belum ada pesanan.</td></tr>' : ''}
          ${ordersCache.map((o) => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 font-mono text-xs">${esc(o.id)}</td>
              <td class="px-4 py-3">
                <span class="block font-medium text-gray-900">${esc(o.customer_name ?? '—')}</span>
                <span class="block text-xs text-gray-500">${esc(o.customer_email)}</span>
                <span class="block text-xs text-gray-400">${o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join(', ')}</span>
              </td>
              <td class="px-4 py-3 font-semibold">${formatPrice(o.total_cents, o.currency)}</td>
              <td class="px-4 py-3">
                <select class="rounded border border-gray-300 px-2 py-1 text-xs ord-status" data-id="${o.id}">
                  ${['pending', 'paid', 'delivered', 'cancelled', 'refunded'].map((s) =>
                    `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
                ${o.payment_proof ? '<span class="mt-1 block text-xs text-blue-600">payment confirmed by customer</span>' : ''}
              </td>
              <td class="px-4 py-3 text-xs text-gray-500">${esc(o.created_at)}</td>
              <td class="px-4 py-3 text-right">
                <button class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 ord-save" data-id="${o.id}">💾 Simpan</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  panel.querySelectorAll('.ord-save').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const status = panel.querySelector(`.ord-status[data-id="${id}"]`).value;
      try {
        await api.adminUpdateOrder(id, { status });
        const res = await api.adminListOrders();
        ordersCache = res.orders;
        renderOrders();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Update failed');
      }
    })
  );
}

async function refreshOrders() {
  const res = await api.adminListOrders();
  ordersCache = res.orders;
}

// ---------- Boot ----------

async function boot() {
  try {
    await api.adminMe();
    renderDashboard();
    await Promise.all([refreshProducts(), refreshOrders()]);
  } catch {
    renderLogin();
  }
}

boot();
