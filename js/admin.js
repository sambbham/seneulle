// Admin panel — manage products, categories and site settings through the API.
// The session token lives in sessionStorage; changes go live on the storefront
// after a page refresh.

import { garmentImage, GARMENT_STYLES } from './data.js';

const TOKEN_KEY = 'threadly_admin_token';

const $ = (sel, root = document) => root.querySelector(sel);

const els = {
  loginView: $('#loginView'),
  dashboardView: $('#dashboardView'),
  loginForm: $('#loginForm'),
  loginPassword: $('#loginPassword'),
  loginError: $('#loginError'),
  loginLogo: $('#loginLogo'),
  tabs: [...document.querySelectorAll('.tab')],
  logoutBtn: $('#logoutBtn'),

  productList: $('#productList'),
  addProductBtn: $('#addProductBtn'),
  categoryList: $('#categoryList'),
  addCategoryBtn: $('#addCategoryBtn'),

  orderList: $('#orderList'),
  refreshOrdersBtn: $('#refreshOrdersBtn'),

  webhookList: $('#webhookList'),
  refreshWebhooksBtn: $('#refreshWebhooksBtn'),

  settingsForm: $('#settingsForm'),

  productModal: $('#productModal'),
  productForm: $('#productForm'),
  productFormTitle: $('#productFormTitle'),
  extraColors: $('#extraColors'),
  addColorBtn: $('#addColorBtn'),
  categoryChecks: $('#categoryChecks'),
  formPreview: $('#formPreview'),

  categoryModal: $('#categoryModal'),
  categoryForm: $('#categoryForm'),
  categoryFormTitle: $('#categoryFormTitle'),

  toast: $('#toast'),
};

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || '',
  data: null,
  settings: null,
  orders: [],
  webhookEvents: [],
  editingProductId: null,
  editingCategoryId: null,
};

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const PAY_LABELS = { qr: 'QR code', cod: 'Cash on delivery' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

let toastTimer = null;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

function api(path, { method = 'GET', body } = {}) {
  // Abort after 10s so a dead server shows a clear error instead of hanging forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  return fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  })
    .then(async (res) => {
      clearTimeout(timer);
      if (res.status === 401) {
        // Only treat 401 as a dead session if we actually had a token;
        // during login it just means the password was wrong.
        if (state.token) logout();
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Not authorized.');
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed.');
      return data;
    })
    .catch((err) => {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('The server did not respond. Is it running? (npm start)');
      }
      throw err;
    });
}

function showToast(msg, type = 'success') {
  els.toast.textContent = msg;
  els.toast.className = 'toast show' + (type === 'error' ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function showLogin() {
  els.loginView.hidden = false;
  els.dashboardView.hidden = true;
}

function showDashboard() {
  els.loginView.hidden = true;
  els.dashboardView.hidden = false;
}

function logout() {
  state.token = '';
  sessionStorage.removeItem(TOKEN_KEY);
  showLogin();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAll() {
  renderProducts();
  renderCategories();
  loadSettings();
  loadOrders();
  loadWebhookEvents();
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

async function loadOrders() {
  try {
    state.orders = await api('/api/orders');
    renderOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderOrders() {
  els.orderList.innerHTML = state.orders.length
    ? state.orders.map(orderRow).join('')
    : '<p class="row-sub">No orders yet — when a customer checks out on the storefront, their order appears here.</p>';
}

function orderRow(o) {
  const pay = PAY_LABELS[o.customer?.paymentMethod] || o.customer?.paymentMethod || '—';
  const items = o.items
    .map(
      (i) =>
        `<span class="order-item"><span class="ci-dot" style="background:${esc(i.color)}"></span>${esc(i.name)} × ${i.qty} — $${Number(i.price * i.qty).toFixed(2)}</span>`
    )
    .join('');
  return (
    `<div class="order-card">` +
    `<div class="order-head">` +
    `<div class="row-main">` +
    `<strong>${esc(o.orderNumber)} <span class="pay-badge">${esc(pay)}</span></strong>` +
    `<span class="row-sub">${esc(o.customer?.name || '')} · ${esc(o.customer?.phone || '')} · ${new Date(o.createdAt).toLocaleString()}</span>` +
    `</div>` +
    `<label class="status-wrap">Status` +
    `<select data-status="${esc(o.id)}">` +
    ORDER_STATUSES.map((s) => `<option value="${s}"${s === o.status ? ' selected' : ''}>${cap(s)}</option>`).join('') +
    `</select>` +
    `</label>` +
    `</div>` +
    `<p class="order-address">Deliver to: ${esc(o.customer?.address || '')}</p>` +
    `<div class="order-items">${items}</div>` +
    `<p class="order-total">Total: <strong>$${Number(o.total).toFixed(2)}</strong></p>` +
    `</div>`
  );
}

function renderProducts() {
  els.productList.innerHTML = state.data.products.length
    ? state.data.products.map(productRow).join('')
    : '<p class="row-sub">No products yet — click “+ Add product”.</p>';
}

function productRow(p) {
  const img = p.image || garmentImage(p.style, p.color);
  const styleLabel = (GARMENT_STYLES.find((s) => s.id === p.style) || {}).label || p.style;
  const chips = p.categories
    .map((id) => {
      const c = state.data.categories.find((k) => k.id === id);
      return c ? `<span class="chip" style="background:${c.color}1a;color:${c.color}">${esc(c.label)}</span>` : '';
    })
    .join('');
  return (
    `<div class="admin-row">` +
    `<img class="row-thumb" src="${img}" alt="">` +
    `<div class="row-main">` +
    `<strong>${esc(p.name)}</strong>` +
    `<span class="row-sub">${esc(styleLabel)} · $${Number(p.price).toFixed(2)}</span>` +
    `<div class="chips">${chips}</div>` +
    `</div>` +
    `<div class="row-actions">` +
    `<button class="btn-ghost" data-edit="${esc(p.id)}">Edit</button>` +
    `<button class="btn-ghost btn-danger" data-del="${esc(p.id)}">Delete</button>` +
    `</div>` +
    `</div>`
  );
}

function renderCategories() {
  els.categoryList.innerHTML = state.data.categories.length
    ? state.data.categories.map(categoryRow).join('')
    : '<p class="row-sub">No categories yet — click “+ Add category”.</p>';
}

function categoryRow(c) {
  const count = state.data.products.filter((p) => p.categories.includes(c.id)).length;
  return (
    `<div class="admin-row">` +
    `<span class="color-dot" style="background:${c.color}"></span>` +
    `<div class="row-main">` +
    `<strong>${esc(c.label)}</strong>` +
    `<span class="row-sub">${count} ${count === 1 ? 'product' : 'products'}</span>` +
    `</div>` +
    `<div class="row-actions">` +
    `<button class="btn-ghost" data-editcat="${esc(c.id)}">Edit</button>` +
    `<button class="btn-ghost btn-danger" data-delcat="${esc(c.id)}">Delete</button>` +
    `</div>` +
    `</div>`
  );
}

async function loadSettings() {
  try {
    // Full settings (including webhook URL) come from the admin-only endpoint.
    state.settings = await api('/api/settings');
    fillSettings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function fillSettings() {
  const s = state.settings || state.data.settings || {};
  [
    'storeName',
    'announcement',
    'heroEyebrow',
    'heroHeadline',
    'heroSub',
    'aboutHeading',
    'aboutText',
    'footerNote',
    'webhookUrl',
    'webhookSecret',
    'adminPassword',
  ].forEach((key) => {
    els.settingsForm.elements[key].value = s[key] || '';
  });
}

// ---------------------------------------------------------------------------
// Product editor
// ---------------------------------------------------------------------------

function fillStyleSelect() {
  els.productForm.elements['style'].innerHTML = GARMENT_STYLES.map(
    (s) => `<option value="${s.id}">${esc(s.label)}</option>`
  ).join('');
}

function addColorRow(value = '#94a3b8') {
  const row = document.createElement('div');
  row.className = 'color-row-edit';
  row.innerHTML =
    `<input type="color" value="${value}">` +
    `<button type="button" class="remove-color" aria-label="Remove colour">✕</button>`;
  row.querySelector('.remove-color').addEventListener('click', () => row.remove());
  els.extraColors.appendChild(row);
}

function updatePreview() {
  const style = els.productForm.elements['style'].value;
  const color = els.productForm.elements['color'].value;
  els.formPreview.src = garmentImage(style, color);
}

function openProductEditor(product = null) {
  state.editingProductId = product ? product.id : null;
  els.productFormTitle.textContent = product ? 'Edit product' : 'Add product';
  els.productForm.reset();
  els.extraColors.innerHTML = '';

  els.productForm.elements['style'].value = product ? product.style : 'tee';
  els.productForm.elements['color'].value = product ? product.color : '#94a3b8';

  if (product) {
    els.productForm.elements['name'].value = product.name;
    els.productForm.elements['price'].value = product.price;
    els.productForm.elements['oldPrice'].value = product.oldPrice ?? '';
    els.productForm.elements['description'].value = product.description || '';
    els.productForm.elements['image'].value = product.image || '';
    (product.colors || [product.color]).slice(1).forEach((c) => addColorRow(c));
  }

  els.categoryChecks.innerHTML = state.data.categories.length
    ? state.data.categories
        .map(
          (c) =>
            `<label class="check"><input type="checkbox" value="${esc(c.id)}" ${product && product.categories.includes(c.id) ? 'checked' : ''}>` +
            `<span class="check-box" style="--dot:${c.color}">${esc(c.label)}</span></label>`
        )
        .join('')
    : '<p class="row-sub">No categories yet — add some in the Categories tab first.</p>';

  updatePreview();
  openModal(els.productModal);
}

function closeProductEditor() {
  closeModal(els.productModal);
  state.editingProductId = null;
}

async function saveProduct(e) {
  e.preventDefault();
  const f = els.productForm.elements;
  const extraColors = [...els.extraColors.querySelectorAll('input[type="color"]')].map((i) => i.value);
  const colors = [f['color'].value, ...extraColors].filter((v, i, a) => a.indexOf(v) === i);

  const payload = {
    name: f['name'].value.trim(),
    price: Number(f['price'].value),
    oldPrice: f['oldPrice'].value ? Number(f['oldPrice'].value) : null,
    description: f['description'].value.trim(),
    style: f['style'].value,
    color: f['color'].value,
    colors,
    image: f['image'].value.trim(),
    categories: [...els.categoryChecks.querySelectorAll('input:checked')].map((i) => i.value),
  };

  try {
    if (state.editingProductId) {
      await api('/api/products/' + state.editingProductId, { method: 'PUT', body: payload });
    } else {
      await api('/api/products', { method: 'POST', body: payload });
    }
    state.data = await api('/api/data');
    renderProducts();
    renderCategories();
    closeProductEditor();
    showToast('Product saved.');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Category editor
// ---------------------------------------------------------------------------

function openCategoryEditor(category = null) {
  state.editingCategoryId = category ? category.id : null;
  els.categoryFormTitle.textContent = category ? 'Edit category' : 'Add category';
  els.categoryForm.reset();
  els.categoryForm.elements['color'].value = category ? category.color : '#64748b';
  if (category) els.categoryForm.elements['label'].value = category.label;
  openModal(els.categoryModal);
}

function closeCategoryEditor() {
  closeModal(els.categoryModal);
  state.editingCategoryId = null;
}

async function saveCategory(e) {
  e.preventDefault();
  const f = els.categoryForm.elements;
  const payload = { label: f['label'].value.trim(), color: f['color'].value };
  try {
    if (state.editingCategoryId) {
      await api('/api/categories/' + state.editingCategoryId, { method: 'PUT', body: payload });
    } else {
      await api('/api/categories', { method: 'POST', body: payload });
    }
    state.data = await api('/api/data');
    renderCategories();
    renderProducts();
    closeCategoryEditor();
    showToast('Category saved.');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------

async function loadWebhookEvents() {
  try {
    state.webhookEvents = await api('/api/webhooks/events');
    renderWebhooks();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderWebhooks() {
  els.webhookList.innerHTML = state.webhookEvents.length
    ? state.webhookEvents.map(webhookRow).join('')
    : '<p class="row-sub">No webhook events received yet. Set the Order webhook URL to this store\'s receiver (e.g. http://localhost:3000/api/webhooks/orders) and place a test order.</p>';
}

function webhookRow(ev) {
  const order = ev.order || {};
  const status = order.status ? `<span class="chip" style="background:#f4f4f5;color:#171717">${esc(order.status)}</span>` : '';
  return (
    `<div class="admin-row">` +
    `<div class="row-main">` +
    `<strong><span class="event-badge">${esc(ev.event)}</span> ${order.orderNumber ? esc(order.orderNumber) : ''}</strong>` +
    `<span class="row-sub">Received ${new Date(ev.receivedAt).toLocaleString()}</span>` +
    `</div>` +
    `<div class="row-actions">${status}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

async function saveSettings(e) {
  e.preventDefault();
  const f = els.settingsForm.elements;
  const payload = {
    storeName: f['storeName'].value,
    announcement: f['announcement'].value,
    heroEyebrow: f['heroEyebrow'].value,
    heroHeadline: f['heroHeadline'].value,
    heroSub: f['heroSub'].value,
    aboutHeading: f['aboutHeading'].value,
    aboutText: f['aboutText'].value,
    footerNote: f['footerNote'].value,
    webhookUrl: f['webhookUrl'].value,
    webhookSecret: f['webhookSecret'].value,
    adminPassword: f['adminPassword'].value,
  };
  try {
    state.settings = await api('/api/settings', { method: 'PUT', body: payload });
    fillSettings();
    showToast('Settings saved — refresh the store to see changes.');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------------------

function openModal(modal) {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function bindModalClose(modal) {
  modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => closeModal(modal)));
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function bind() {
  // login
  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = els.loginForm.querySelector('button[type="submit"]');
    const originalLabel = btn.textContent;
    els.loginError.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const { token } = await api('/api/login', { method: 'POST', body: { password: els.loginPassword.value } });
      state.token = token;
      sessionStorage.setItem(TOKEN_KEY, token);
      state.data = await api('/api/data');
      renderAll();
      showDashboard();
    } catch (err) {
      els.loginError.textContent = err.message;
      els.loginError.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

  // tabs
  els.tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      els.tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-pressed', String(active));
      });
      ['products', 'categories', 'orders', 'webhooks', 'settings'].forEach((name) => {
        $('#tab-' + name).hidden = name !== tab.dataset.tab;
      });
      // Keep lists fresh whenever their tab is opened.
      if (tab.dataset.tab === 'orders') loadOrders();
      if (tab.dataset.tab === 'webhooks') loadWebhookEvents();
    })
  );

  // orders
  els.refreshOrdersBtn.addEventListener('click', loadOrders);
  els.orderList.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-status]');
    if (!sel) return;
    try {
      await api('/api/orders/' + sel.dataset.status + '/status', { method: 'PUT', body: { status: sel.value } });
      showToast('Order ' + sel.dataset.status + ' marked as ' + sel.value + '.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // products
  els.addProductBtn.addEventListener('click', () => openProductEditor());
  els.productList.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-del]');
    if (editBtn) {
      const product = state.data.products.find((p) => p.id === editBtn.dataset.edit);
      if (product) openProductEditor(product);
    }
    if (delBtn) {
      const product = state.data.products.find((p) => p.id === delBtn.dataset.del);
      if (product && confirm(`Delete "${product.name}"?`)) deleteProduct(product.id);
    }
  });
  els.productForm.addEventListener('submit', saveProduct);
  els.productForm.elements['style'].addEventListener('change', updatePreview);
  els.productForm.elements['color'].addEventListener('input', updatePreview);
  els.addColorBtn.addEventListener('click', () => addColorRow());

  // categories
  els.addCategoryBtn.addEventListener('click', () => openCategoryEditor());
  els.categoryList.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-editcat]');
    const delBtn = e.target.closest('[data-delcat]');
    if (editBtn) {
      const category = state.data.categories.find((c) => c.id === editBtn.dataset.editcat);
      if (category) openCategoryEditor(category);
    }
    if (delBtn) {
      const category = state.data.categories.find((c) => c.id === delBtn.dataset.delcat);
      if (
        category &&
        confirm(`Delete category "${category.label}"? Products in it will keep everything except this tag.`)
      ) {
        deleteCategory(category.id);
      }
    }
  });
  els.categoryForm.addEventListener('submit', saveCategory);

  // webhooks
  els.refreshWebhooksBtn.addEventListener('click', loadWebhookEvents);

  // settings
  els.settingsForm.addEventListener('submit', saveSettings);

  // modals
  bindModalClose(els.productModal);
  bindModalClose(els.categoryModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (els.productModal.classList.contains('open')) closeProductEditor();
      if (els.categoryModal.classList.contains('open')) closeCategoryEditor();
    }
  });

  // logout
  els.logoutBtn.addEventListener('click', () => logout());
}

async function deleteProduct(id) {
  try {
    await api('/api/products/' + id, { method: 'DELETE' });
    state.data = await api('/api/data');
    renderProducts();
    renderCategories();
    showToast('Product deleted.');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteCategory(id) {
  try {
    await api('/api/categories/' + id, { method: 'DELETE' });
    state.data = await api('/api/data');
    renderCategories();
    renderProducts();
    showToast('Category deleted.');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  // Opening admin.html directly from disk (file://) breaks ES modules — the
  // whole page silently stops working. Point the user at the server instead.
  if (location.protocol === 'file:') {
    els.loginError.textContent =
      'This page must be opened through the Node server: run `npm start`, then open http://localhost:3000/admin.html';
    els.loginError.hidden = false;
  }

  fillStyleSelect();
  bind();

  // Show the store name on the login card (public endpoint) and surface
  // connectivity problems immediately instead of failing silently.
  try {
    const pub = await api('/api/data');
    els.loginLogo.innerHTML = `${esc(String(pub.settings.storeName || 'Store').replace(/\.$/, ''))}<span>.</span>`;
  } catch (err) {
    els.loginError.textContent =
      'Can\'t reach the server: ' +
      err.message +
      ' — run `npm start` in the project folder, then open http://localhost:3000/admin.html and refresh this page.';
    els.loginError.hidden = false;
  }

  if (state.token) {
    try {
      await api('/api/me');
      state.data = await api('/api/data');
      renderAll();
      showDashboard();
    } catch {
      logout();
    }
  } else {
    showLogin();
  }
}

init();
