// Storefront — loads all content from the server API and renders it.
// The whole page (settings, categories, products) is editable from /admin.html.

import { garmentImage, shade } from './data.js';

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  data: null,
  filter: 'all',
  viewer: null,
  cartItems: [],
  checkedOut: false,
  customer: null, // signed-in customer { id, name, email, phone, address, paymentMethod }
  myOrders: [],
};

const CUSTOMER_TOKEN_KEY = 'threadly_customer_token';
const CUSTOMER_KEY = 'threadly_customer';
let customerToken = localStorage.getItem(CUSTOMER_TOKEN_KEY) || '';

const els = {
  announcement: $('#announcement'),
  logo: $('#logo'),
  heroEyebrow: $('#heroEyebrow'),
  heroHeadline: $('#heroHeadline'),
  heroSub: $('#heroSub'),
  aboutHeading: $('#aboutHeading'),
  aboutText: $('#aboutText'),
  footerLogo: $('#footerLogo'),
  footerNote: $('#footerNote'),
  filterBar: $('#filterBar'),
  resultCount: $('#resultCount'),
  grid: $('#productGrid'),
  collectionCards: $('#collectionCards'),
  storeError: $('#storeError'),
  modal: $('#viewerModal'),
  stage: $('#viewerStage'),
  detail: $('#productDetail'),
  cartCount: $('#cartCount'),
  cartBtn: $('#cartBtn'),
  cartDrawer: $('#cartDrawer'),
  cartItems: $('#cartItems'),
  cartTotal: $('#cartTotal'),
  checkoutBtn: $('#checkoutBtn'),
  accountBtn: $('#accountBtn'),
  accountLabel: $('#accountLabel'),
  accountModal: $('#accountModal'),
  accountBody: $('#accountBody'),
};

const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function init() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    state.data = await res.json();
  } catch (err) {
    console.error('Failed to load store data:', err);
    els.storeError.hidden = false;
    return;
  }
  loadCustomer();
  updateAccountUI();
  renderSettings();
  renderFilters();
  renderCollections();
  renderGrid();
  bindModal();
  updateCartUI();
}

// ---------------------------------------------------------------------------
// Settings (site text)
// ---------------------------------------------------------------------------

function storeName() {
  return String(state.data.settings.storeName || 'Store').replace(/\.$/, '');
}

function renderSettings() {
  const s = state.data.settings;
  document.title = `${storeName()} — Clothing Store`;
  els.logo.innerHTML = `${esc(storeName())}<span>.</span>`;
  els.footerLogo.innerHTML = `${esc(storeName())}<span>.</span>`;
  els.heroEyebrow.textContent = s.heroEyebrow || '';

  // accent the last word of the headline (styled via .hero h1 em)
  const words = String(s.heroHeadline || '').split(/\s+/).filter(Boolean);
  els.heroHeadline.innerHTML = words.length
    ? `${esc(words.slice(0, -1).join(' '))} <em>${esc(words[words.length - 1])}</em>`
    : '';

  els.heroSub.textContent = s.heroSub || '';
  els.aboutHeading.textContent = s.aboutHeading || '';
  els.aboutText.innerHTML = esc(String(s.aboutText || '').replaceAll('{store}', storeName()));
  els.footerNote.textContent = s.footerNote || '';

  if (s.announcement) {
    els.announcement.textContent = s.announcement;
    els.announcement.hidden = false;
  }
}

// ---------------------------------------------------------------------------
// Filters + collections
// ---------------------------------------------------------------------------

function renderFilters() {
  const buttons = [{ id: 'all', label: 'All' }, ...state.data.categories.map((c) => ({ id: c.id, label: c.label }))];
  els.filterBar.innerHTML = buttons
    .map(
      (b) =>
        `<button class="filter-btn${b.id === state.filter ? ' active' : ''}" data-filter="${esc(b.id)}" aria-pressed="${b.id === state.filter}">${esc(b.label)}</button>`
    )
    .join('');

  els.filterBar.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      els.filterBar.querySelectorAll('.filter-btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderGrid();
    });
  });
}

function renderCollections() {
  els.collectionCards.innerHTML = state.data.categories
    .map((c) => {
      const count = state.data.products.filter((p) => p.categories.includes(c.id)).length;
      return (
        `<button class="collection-card" data-jump="${esc(c.id)}" style="background:linear-gradient(135deg, ${c.color}, ${shade(c.color, 45)})">` +
        `<span class="cc-tag">${esc(c.label)}</span>` +
        `<h3>${esc(c.label)}</h3>` +
        `<p>${count} ${count === 1 ? 'piece' : 'pieces'} to discover</p>` +
        `<span class="cc-cta">Shop now</span>` +
        `</button>`
      );
    })
    .join('');

  els.collectionCards.querySelectorAll('.collection-card').forEach((card) => {
    card.addEventListener('click', () => {
      const btn = els.filterBar.querySelector(`.filter-btn[data-filter="${card.dataset.jump}"]`);
      if (btn) btn.click();
      document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// ---------------------------------------------------------------------------
// Product grid
// ---------------------------------------------------------------------------

function renderGrid() {
  const { products, categories } = state.data;
  const items = state.filter === 'all' ? products : products.filter((p) => p.categories.includes(state.filter));
  els.grid.innerHTML = items.map((p, i) => productCard(p, categories, i)).join('');
  els.resultCount.textContent = `Showing ${items.length} ${items.length === 1 ? 'product' : 'products'}`;
}

function productCard(p, categories, i) {
  const img = p.image || garmentImage(p.style, p.color);
  const badges = p.categories
    .map((id) => {
      const c = categories.find((k) => k.id === id);
      return c ? `<span class="badge" style="background:${c.color}">${esc(c.label)}</span>` : '';
    })
    .join('');
  const swatches = (p.colors && p.colors.length ? p.colors : [p.color])
    .map((c) => `<span class="swatch" style="background:${c}"></span>`)
    .join('');

  return (
    `<article class="product-card" style="animation-delay:${i * 50}ms">` +
    `<button class="card-media" data-id="${esc(p.id)}" aria-label="Open 360° view of ${esc(p.name)}">` +
    `<img src="${img}" alt="${esc(p.name)}">` +
    `<div class="card-badges">${badges}</div>` +
    `<span class="view-360"><span class="spin-icon">⟳</span> 360° View</span>` +
    `</button>` +
    `<div class="card-body">` +
    `<h3>${esc(p.name)}</h3>` +
    `<div class="card-meta">` +
    `<p class="price">${priceHtml(p)}</p>` +
    `<div class="swatches">${swatches}</div>` +
    `</div>` +
    `</div>` +
    `</article>`
  );
}

function priceHtml(p) {
  const now = `$${Number(p.price).toFixed(2)}`;
  return p.oldPrice != null
    ? `<span class="price-now">${now}</span> <s class="price-old">$${Number(p.oldPrice).toFixed(2)}</s>`
    : `<span class="price-now">${now}</span>`;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

function cartCount() {
  return state.cartItems.reduce((s, i) => s + i.qty, 0);
}

function cartTotal() {
  return state.cartItems.reduce((s, i) => s + i.qty * Number(i.price), 0);
}

function addToCart(product, color) {
  const key = `${product.id}|${color || product.color}`;
  const existing = state.cartItems.find((i) => i.key === key);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cartItems.push({
      key,
      id: product.id,
      name: product.name,
      price: product.price,
      color: color || product.color,
      img: product.image || garmentImage(product.style, color || product.color),
      qty: 1,
    });
  }
  updateCartUI();
}

function setCartQty(key, qty) {
  const item = state.cartItems.find((i) => i.key === key);
  if (!item) return;
  item.qty = Math.max(1, qty);
  updateCartUI();
}

function removeCartItem(key) {
  state.cartItems = state.cartItems.filter((i) => i.key !== key);
  updateCartUI();
}

function updateCartUI() {
  els.cartCount.textContent = `Cart (${cartCount()})`;
  els.cartTotal.textContent = `$${cartTotal().toFixed(2)}`;
  if (state.checkedOut) return;
  if (!state.cartItems.length) {
    els.cartItems.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    return;
  }
  els.cartItems.innerHTML = state.cartItems
    .map(
      (item) =>
        `<div class="cart-item">` +
        `<img src="${item.img}" alt="">` +
        `<div class="cart-item-info">` +
        `<strong>${esc(item.name)}</strong>` +
        `<span class="ci-sub">$${Number(item.price).toFixed(2)}<span class="ci-dot" style="background:${item.color}"></span></span>` +
        `<div class="qty-row">` +
        `<button class="qty-btn" data-qty-minus="${esc(item.key)}" aria-label="Decrease quantity">−</button>` +
        `<span>${item.qty}</span>` +
        `<button class="qty-btn" data-qty-plus="${esc(item.key)}" aria-label="Increase quantity">+</button>` +
        `<button class="ci-remove" data-remove="${esc(item.key)}">Remove</button>` +
        `</div>` +
        `</div>` +
        `<strong class="ci-price">$${(Number(item.price) * item.qty).toFixed(2)}</strong>` +
        `</div>`
    )
    .join('');
}

function openCart() {
  if (els.accountModal.classList.contains('open')) closeAccountModal();
  els.cartDrawer.classList.add('open');
  els.cartDrawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeCart() {
  els.cartDrawer.classList.remove('open');
  els.cartDrawer.setAttribute('aria-hidden', 'true');
  if (!els.modal.classList.contains('open') && !els.accountModal.classList.contains('open')) {
    document.body.classList.remove('modal-open');
  }
}

// ---------------------------------------------------------------------------
// Customer session
// ---------------------------------------------------------------------------

function loadCustomer() {
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    state.customer = raw ? JSON.parse(raw) : null;
  } catch {
    state.customer = null;
  }
}

function saveCustomer(token, customer) {
  state.customer = customer;
  if (token) {
    customerToken = token;
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  }
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
  updateAccountUI();
}

function clearCustomer() {
  state.customer = null;
  customerToken = '';
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_KEY);
  updateAccountUI();
}

/** Small fetch helper that always speaks JSON and throws server error messages. */
async function apiCall(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(customerToken ? { Authorization: 'Bearer ' + customerToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

// ---------------------------------------------------------------------------
// Checkout (real order flow — details + payment method, no online payment)
// ---------------------------------------------------------------------------

function checkout() {
  if (!state.cartItems.length) return;
  state.checkedOut = false;
  els.checkoutBtn.hidden = false;
  if (state.customer) showCheckoutSummary();
  else showCheckoutForm();
}

/** Registration form for a new customer (or prefilled when editing details). */
function showCheckoutForm(customer = null) {
  const isEdit = Boolean(customer);
  const c = customer || {};
  els.cartItems.innerHTML =
    `<div class="checkout-form">` +
    `<div class="co-head">` +
    `<button class="co-back" id="coBack" type="button">← Back to cart</button>` +
    `<h4>${isEdit ? 'Edit details' : 'Checkout'}</h4>` +
    `</div>` +
    `<p class="co-hint">${isEdit ? 'Update your details below — your order is placed after saving.' : 'Enter your delivery details to register and place the order. No payment is taken online.'}</p>` +
    `<label class="co-field">Full name <input type="text" id="coName" value="${esc(c.name || '')}" required></label>` +
    `<label class="co-field">Email <input type="email" id="coEmail" value="${esc(c.email || '')}" required></label>` +
    `<label class="co-field">Delivery address <textarea id="coAddress" rows="2" required>${esc(c.address || '')}</textarea></label>` +
    `<label class="co-field">Phone number <input type="tel" id="coPhone" value="${esc(c.phone || '')}" placeholder="e.g. +1 555 123 4567" required></label>` +
    `<label class="co-field">Password <input type="password" id="coPassword" autocomplete="new-password" ${isEdit ? 'placeholder="Leave blank to keep your current password"' : 'required'}></label>` +
    `<fieldset class="co-pay">` +
    `<legend>Payment method</legend>` +
    `<label class="pay-option"><input type="radio" name="coPay" value="cod"${c.paymentMethod !== 'qr' ? ' checked' : ''}><span>Cash on delivery — pay when your order arrives</span></label>` +
    `<label class="pay-option"><input type="radio" name="coPay" value="qr"${c.paymentMethod === 'qr' ? ' checked' : ''}><span>QR code — scan to pay when your order arrives</span></label>` +
    `</fieldset>` +
    `<p class="co-error" id="coError" hidden></p>` +
    `<button class="btn-primary co-submit" id="coSubmit" type="button">${isEdit ? 'Save details & place order' : 'Register & place order'}</button>` +
    (isEdit ? '' : `<p class="co-alt">Already registered? <button class="co-link" id="coSignIn" type="button">Sign in</button></p>`) +
    `</div>`;

  els.cartItems.querySelector('#coBack').addEventListener('click', () => updateCartUI());
  els.cartItems.querySelector('#coSubmit').addEventListener('click', async () => {
    const form = {
      name: els.cartItems.querySelector('#coName').value.trim(),
      email: els.cartItems.querySelector('#coEmail').value.trim(),
      address: els.cartItems.querySelector('#coAddress').value.trim(),
      phone: els.cartItems.querySelector('#coPhone').value.trim(),
      paymentMethod: els.cartItems.querySelector('input[name="coPay"]:checked').value,
    };
    const password = els.cartItems.querySelector('#coPassword').value;
    const errorBox = els.cartItems.querySelector('#coError');
    const btn = els.cartItems.querySelector('#coSubmit');
    errorBox.hidden = true;
    btn.disabled = true;
    try {
      if (isEdit) {
        if (password) form.password = password;
        const customer = await apiCall('/api/customer', { method: 'PUT', body: form });
        saveCustomer(customerToken, customer);
      } else {
        form.password = password;
        const data = await apiCall('/api/register', { method: 'POST', body: form });
        saveCustomer(data.token, data.customer);
      }
      await placeOrder();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
      btn.disabled = false;
    }
  });
  const signIn = els.cartItems.querySelector('#coSignIn');
  if (signIn) signIn.addEventListener('click', showSignInForm);
}

/** Phone-only sign-in for returning customers. */
function showSignInForm() {
  els.cartItems.innerHTML =
    `<div class="checkout-form">` +
    `<div class="co-head">` +
    `<button class="co-back" id="coBack" type="button">← Back to cart</button>` +
    `<h4>Sign in</h4>` +
    `</div>` +
    `<p class="co-hint">Sign in with your email or phone number and password to place this order.</p>` +
    `<label class="co-field">Email or phone <input type="text" id="coIdentifier" placeholder="you@example.com or +1 555 123 4567" required></label>` +
    `<label class="co-field">Password <input type="password" id="coPassword" autocomplete="current-password" required></label>` +
    `<p class="co-error" id="coError" hidden></p>` +
    `<button class="btn-primary co-submit" id="coSignInBtn" type="button">Sign in & place order</button>` +
    `<p class="co-alt">New here? <button class="co-link" id="coRegister" type="button">Register instead</button></p>` +
    `</div>`;

  els.cartItems.querySelector('#coBack').addEventListener('click', () => updateCartUI());
  els.cartItems.querySelector('#coRegister').addEventListener('click', () => showCheckoutForm());
  els.cartItems.querySelector('#coSignInBtn').addEventListener('click', async () => {
    const identifier = els.cartItems.querySelector('#coIdentifier').value.trim();
    const password = els.cartItems.querySelector('#coPassword').value;
    const errorBox = els.cartItems.querySelector('#coError');
    const btn = els.cartItems.querySelector('#coSignInBtn');
    errorBox.hidden = true;
    btn.disabled = true;
    try {
      const data = await apiCall('/api/customer-login', { method: 'POST', body: { identifier, password } });
      saveCustomer(data.token, data.customer);
      await placeOrder();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
      btn.disabled = false;
    }
  });
}

/** Signed-in customer: confirm saved details + payment method, then place the order. */
function showCheckoutSummary() {
  const c = state.customer;
  els.cartItems.innerHTML =
    `<div class="checkout-form">` +
    `<div class="co-head">` +
    `<button class="co-back" id="coBack" type="button">← Back to cart</button>` +
    `<h4>Confirm order</h4>` +
    `</div>` +
    `<div class="co-summary">` +
    `<p><strong>Name</strong><span>${esc(c.name)}</span></p>` +
    `<p><strong>Address</strong><span>${esc(c.address)}</span></p>` +
    `<p><strong>Phone</strong><span>${esc(c.phone)}</span></p>` +
    `</div>` +
    `<fieldset class="co-pay">` +
    `<legend>Payment method</legend>` +
    `<label class="pay-option"><input type="radio" name="coPay" value="cod"${c.paymentMethod !== 'qr' ? ' checked' : ''}><span>Cash on delivery — pay when your order arrives</span></label>` +
    `<label class="pay-option"><input type="radio" name="coPay" value="qr"${c.paymentMethod === 'qr' ? ' checked' : ''}><span>QR code — scan to pay when your order arrives</span></label>` +
    `</fieldset>` +
    `<p class="co-error" id="coError" hidden></p>` +
    `<button class="btn-primary co-submit" id="coPlace" type="button">Place order — $${cartTotal().toFixed(2)}</button>` +
    `<div class="co-actions">` +
    `<button class="co-btn" id="coEdit" type="button">Edit details</button>` +
    `<button class="co-btn" id="coSignOut" type="button">Sign out</button>` +
    `</div>` +
    `</div>`;

  els.cartItems.querySelector('#coBack').addEventListener('click', () => updateCartUI());
  els.cartItems.querySelector('#coPlace').addEventListener('click', async () => {
    const method = els.cartItems.querySelector('input[name="coPay"]:checked').value;
    if (method !== state.customer.paymentMethod) {
      saveCustomer(customerToken, { ...state.customer, paymentMethod: method });
    }
    await placeOrder();
  });
  els.cartItems.querySelector('#coEdit').addEventListener('click', () => showCheckoutForm(state.customer));
  els.cartItems.querySelector('#coSignOut').addEventListener('click', () => {
    clearCustomer();
    updateCartUI();
  });
}

/** Sends the cart to the server, which validates it and records the order. */
async function placeOrder() {
  const errorBox = els.cartItems.querySelector('#coError');
  const btn = els.cartItems.querySelector('#coSubmit, #coSignInBtn, #coPlace');
  if (btn) btn.disabled = true;
  try {
    const data = await apiCall('/api/orders', {
      method: 'POST',
      body: { items: state.cartItems.map((i) => ({ id: i.id, qty: i.qty, color: i.color })) },
    });
    showOrderPlaced(data.order);
  } catch (err) {
    if (errorBox) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    }
    if (btn) btn.disabled = false;
  }
}

function showOrderPlaced(order) {
  const count = cartCount();
  const pay = order.customer.paymentMethod === 'qr' ? 'QR code' : 'Cash on delivery';
  const payNote =
    order.customer.paymentMethod === 'qr'
      ? 'Scan the QR code to pay when your order arrives.'
      : 'Pay in cash when your order arrives.';
  state.checkedOut = true;
  els.checkoutBtn.hidden = true;
  els.cartItems.innerHTML =
    `<div class="order-placed">` +
    `<span class="op-icon">✓</span>` +
    `<h4>Order placed!</h4>` +
    `<p class="op-num">Order <strong>${esc(order.orderNumber)}</strong></p>` +
    `<p>Your order of ${count} ${count === 1 ? 'item' : 'items'} totalling <strong>$${Number(order.total).toFixed(2)}</strong> has been received.</p>` +
    `<p class="op-pay">Payment: <strong>${pay}</strong> — ${payNote}</p>` +
    `<button class="btn-primary" id="continueShopping">Continue shopping</button>` +
    `</div>`;
  els.cartItems.querySelector('#continueShopping').addEventListener('click', () => {
    state.cartItems = [];
    state.checkedOut = false;
    els.checkoutBtn.hidden = false;
    updateCartUI();
    closeCart();
  });
}

// ---------------------------------------------------------------------------
// Account (sign in / register / my orders)
// ---------------------------------------------------------------------------

function updateAccountUI() {
  if (state.customer) {
    const first = String(state.customer.name || 'Account').trim().split(/\s+/)[0];
    els.accountLabel.textContent = first;
    els.accountBtn.setAttribute('aria-label', 'Account: ' + state.customer.name);
  } else {
    els.accountLabel.textContent = 'Sign in';
    els.accountBtn.setAttribute('aria-label', 'Sign in to your account');
  }
}

function openAccountModal() {
  if (els.cartDrawer.classList.contains('open')) closeCart();
  els.accountModal.classList.add('open');
  els.accountModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  if (state.customer) renderMyOrders();
  else renderAccountAuth();
}

function closeAccountModal() {
  els.accountModal.classList.remove('open');
  els.accountModal.setAttribute('aria-hidden', 'true');
  if (!els.modal.classList.contains('open') && !els.cartDrawer.classList.contains('open')) {
    document.body.classList.remove('modal-open');
  }
}

/** Sign-in / register screens inside the account modal. */
function renderAccountAuth(mode = 'signin') {
  const isRegister = mode === 'register';
  els.accountBody.innerHTML =
    `<div class="account-view">` +
    `<h3>${isRegister ? 'Create account' : 'Sign in'}</h3>` +
    `<p class="co-hint">${isRegister ? 'Register to place orders and track them here.' : 'Sign in with your phone number to view and manage your orders.'}</p>` +
    (isRegister
      ? `<label class="co-field">Full name <input type="text" id="accName" required></label>` +
        `<label class="co-field">Email <input type="email" id="accEmail" required></label>` +
        `<label class="co-field">Delivery address <textarea id="accAddress" rows="2" required></textarea></label>` +
        `<label class="co-field">Phone number <input type="tel" id="accPhone" placeholder="e.g. +1 555 123 4567" required></label>` +
        `<label class="co-field">Password <input type="password" id="accPassword" autocomplete="new-password" required></label>` +
        `<fieldset class="co-pay">` +
        `<legend>Payment method</legend>` +
        `<label class="pay-option"><input type="radio" name="accPay" value="cod" checked><span>Cash on delivery</span></label>` +
        `<label class="pay-option"><input type="radio" name="accPay" value="qr"><span>QR code</span></label>` +
        `</fieldset>` +
        `<p class="co-error" id="accError" hidden></p>` +
        `<button class="btn-primary co-submit" id="accRegisterBtn" type="button">Register</button>` +
        `<p class="co-alt">Already registered? <button class="co-link" id="accToSignIn" type="button">Sign in</button></p>`
      : `<label class="co-field">Email or phone <input type="text" id="accIdentifier" placeholder="you@example.com or +1 555 123 4567" required></label>` +
        `<label class="co-field">Password <input type="password" id="accPassword" autocomplete="current-password" required></label>` +
        `<p class="co-error" id="accError" hidden></p>` +
        `<button class="btn-primary co-submit" id="accSignInBtn" type="button">Sign in</button>` +
        `<p class="co-alt">New here? <button class="co-link" id="accToRegister" type="button">Create an account</button></p>`) +
    `</div>`;

  const errorBox = els.accountBody.querySelector('#accError');
  const toRegister = els.accountBody.querySelector('#accToRegister');
  if (toRegister) toRegister.addEventListener('click', () => renderAccountAuth('register'));
  const toSignIn = els.accountBody.querySelector('#accToSignIn');
  if (toSignIn) toSignIn.addEventListener('click', () => renderAccountAuth('signin'));

  const signInBtn = els.accountBody.querySelector('#accSignInBtn');
  if (signInBtn) {
    signInBtn.addEventListener('click', async () => {
      const identifier = els.accountBody.querySelector('#accIdentifier').value.trim();
      const password = els.accountBody.querySelector('#accPassword').value;
      errorBox.hidden = true;
      signInBtn.disabled = true;
      try {
        const data = await apiCall('/api/customer-login', { method: 'POST', body: { identifier, password } });
        saveCustomer(data.token, data.customer);
        renderMyOrders();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        signInBtn.disabled = false;
      }
    });
  }

  const registerBtn = els.accountBody.querySelector('#accRegisterBtn');
  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      const form = {
        name: els.accountBody.querySelector('#accName').value.trim(),
        email: els.accountBody.querySelector('#accEmail').value.trim(),
        address: els.accountBody.querySelector('#accAddress').value.trim(),
        phone: els.accountBody.querySelector('#accPhone').value.trim(),
        paymentMethod: els.accountBody.querySelector('input[name="accPay"]:checked').value,
        password: els.accountBody.querySelector('#accPassword').value,
      };
      errorBox.hidden = true;
      registerBtn.disabled = true;
      try {
        const data = await apiCall('/api/register', { method: 'POST', body: form });
        saveCustomer(data.token, data.customer);
        renderMyOrders();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        registerBtn.disabled = false;
      }
    });
  }
}

/** Signed-in customer's order history with per-order cancel buttons. */
async function renderMyOrders() {
  els.accountBody.innerHTML =
    `<div class="account-view">` +
    `<div class="account-user">` +
    `<h3>Hello, ${esc(String(state.customer.name || 'there').split(/\s+/)[0])}</h3>` +
    `<button class="co-btn co-btn--sm" id="accSignOut" type="button">Sign out</button>` +
    `</div>` +
    `<p class="co-hint">Your orders and their status. Orders that haven't shipped yet can be cancelled.</p>` +
    `<p class="co-error" id="accError" hidden></p>` +
    `<div id="myOrders"></div>` +
    `</div>`;

  els.accountBody.querySelector('#accSignOut').addEventListener('click', () => {
    clearCustomer();
    renderAccountAuth();
  });

  const box = els.accountBody.querySelector('#myOrders');
  box.innerHTML = '<p class="co-hint">Loading your orders…</p>';
  try {
    state.myOrders = await apiCall('/api/orders/my');
    box.innerHTML = state.myOrders.length
      ? state.myOrders.map(myOrderRow).join('')
      : '<p class="account-empty">You have no orders yet. Add something to your cart and check out to get started!</p>';
  } catch (err) {
    box.innerHTML = '';
    const errorBox = els.accountBody.querySelector('#accError');
    errorBox.textContent = err.message;
    errorBox.hidden = false;
  }
}

/** Orders placed before the timeline existed get a best-effort history. */
function orderHistory(o) {
  if (Array.isArray(o.history) && o.history.length) return o.history;
  const h = [{ status: 'pending', at: o.createdAt }];
  if (o.status && o.status !== 'pending') h.push({ status: o.status, at: o.createdAt });
  return h;
}

function myOrderRow(o) {
  const cancellable = o.status === 'pending' || o.status === 'confirmed';
  const pay = o.customer.paymentMethod === 'qr' ? 'QR' : 'COD';
  const items = o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join(', ');
  const history = orderHistory(o);
  const timeline = history
    .map(
      (h, idx) =>
        `<div class="tl-step${idx === history.length - 1 ? ' current' : ''}${h.status === 'cancelled' ? ' cancelled' : ''}">` +
        `<span class="tl-dot"></span>` +
        `<div class="tl-body"><strong>${STATUS_LABELS[h.status] || esc(h.status)}</strong><span>${new Date(h.at).toLocaleString()}</span></div>` +
        `</div>`
    )
    .join('');
  return (
    `<div class="my-order">` +
    `<div class="my-order-head">` +
    `<strong>${esc(o.orderNumber)}</strong>` +
    `<span class="order-status status-${esc(o.status)}">${STATUS_LABELS[o.status] || esc(o.status)}</span>` +
    `</div>` +
    `<p class="my-order-meta">${new Date(o.createdAt).toLocaleString()} · ${pay} · ${items}</p>` +
    `<div class="order-timeline">${timeline}</div>` +
    `<div class="my-order-foot">` +
    `<strong>$${Number(o.total).toFixed(2)}</strong>` +
    `<div class="my-order-actions">` +
    `<button class="co-btn co-btn--sm" data-reorder="${esc(o.id)}" type="button">Re-order</button>` +
    (cancellable
      ? `<button class="co-btn co-btn--sm co-btn--danger" data-cancel-order="${esc(o.id)}" type="button">Cancel order</button>`
      : '') +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

/** Puts this order's items back in the cart (current prices) and opens the cart. */
function reorderOrder(orderId) {
  const order = state.myOrders.find((o) => o.id === orderId);
  if (!order) return;
  const missing = [];
  const toAdd = [];
  for (const item of order.items) {
    const product = state.data.products.find((p) => p.id === item.id);
    if (!product) {
      missing.push(item.name);
      continue;
    }
    const color = Array.isArray(product.colors) && product.colors.includes(item.color) ? item.color : product.color;
    for (let n = 0; n < item.qty; n++) toAdd.push({ product, color });
  }
  if (!toAdd.length) {
    alert("None of this order's items are still available, so it can't be re-ordered.");
    return;
  }
  if (state.cartItems.length && !confirm("Replace your current cart with this order's items?")) return;
  state.cartItems = [];
  toAdd.forEach(({ product, color }) => addToCart(product, color));
  if (missing.length) {
    alert(`Re-ordered ${toAdd.length} item(s). Not added (no longer available): ${missing.join(', ')}`);
  }
  closeAccountModal();
  openCart();
}

async function cancelOrder(id) {
  if (!confirm('Cancel this order?')) return;
  const errorBox = els.accountBody.querySelector('#accError');
  try {
    await apiCall('/api/orders/' + id + '/cancel', { method: 'PUT' });
    renderMyOrders();
  } catch (err) {
    if (errorBox) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    }
  }
}

// ---------------------------------------------------------------------------
// 360° viewer modal
// ---------------------------------------------------------------------------

async function openModal(product) {
  const categories = state.data.categories;
  const colors = product.colors && product.colors.length ? product.colors : [product.color];
  // Products with a photo spin set use the image-sequence viewer instead of
  // the procedural 3D garment — colour swatches don't apply to real photos.
  const spin = product.spin && product.spin.base && product.spin.count ? product.spin : null;
  const colorRowHtml =
    `<div class="color-row">` +
    `<span class="color-label">Colour</span>` +
    `<div class="swatches swatches-lg" id="colorSwatches">` +
    colors
      .map(
        (c, i) =>
          `<button class="swatch${i === 0 ? ' active' : ''}" style="background:${c}" data-color="${c}" aria-label="Switch to colour ${c}"></button>`
      )
      .join('') +
    `</div>` +
    `</div>`;

  els.detail.innerHTML =
    `<div class="chips">` +
    product.categories
      .map((id) => {
        const c = categories.find((k) => k.id === id);
        return c ? `<span class="badge" style="background:${c.color}">${esc(c.label)}</span>` : '';
      })
      .join('') +
    `</div>` +
    `<h3>${esc(product.name)}</h3>` +
    `<p class="price">${priceHtml(product)}</p>` +
    `<p class="desc">${esc(product.description)}</p>` +
    `${spin ? '' : colorRowHtml}` +
    `<p class="viewer-hint">${spin ? 'Drag to spin · Scroll to zoom' : 'Drag to rotate · Scroll to zoom'}</p>` +
    `<div class="btn-row">` +
    `<button class="btn-add" id="addToCart">Add to cart</button>` +
    `<button class="btn-order" id="orderNow">Order now</button>` +
    `</div>`;

  els.modal.classList.add('open');
  els.modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  els.stage.innerHTML = '';

  try {
    if (spin) {
      const { createSpinViewer } = await import('./spin.js');
      state.viewer = createSpinViewer(els.stage, spin);
    } else {
      const { createGarmentViewer } = await import('./viewer.js');
      state.viewer = createGarmentViewer(els.stage, product);
    }
  } catch (err) {
    console.error(err);
    els.stage.innerHTML =
      '<p class="stage-error">The 360° viewer could not load — check your internet connection and try again.</p>';
  }

  els.detail.querySelectorAll('#colorSwatches .swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.detail.querySelectorAll('#colorSwatches .swatch').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (state.viewer) state.viewer.setColor(btn.dataset.color);
    });
  });

  const activeColor = () => {
    const active = els.detail.querySelector('#colorSwatches .swatch.active');
    return active ? active.dataset.color : product.color;
  };

  els.detail.querySelector('#addToCart').addEventListener('click', (e) => {
    addToCart(product, activeColor());
    e.currentTarget.textContent = 'Added ✓';
    setTimeout(() => {
      e.currentTarget.textContent = 'Add to cart';
    }, 1200);
  });

  els.detail.querySelector('#orderNow').addEventListener('click', () => {
    addToCart(product, activeColor());
    closeModal();
    openCart();
  });

  els.modal.querySelector('.modal-close').focus();
}

function closeModal() {
  els.modal.classList.remove('open');
  els.modal.setAttribute('aria-hidden', 'true');
  if (!els.cartDrawer.classList.contains('open') && !els.accountModal.classList.contains('open')) {
    document.body.classList.remove('modal-open');
  }
  if (state.viewer) {
    state.viewer.dispose();
    state.viewer = null;
  }
  els.stage.innerHTML = '';
}

function bindModal() {
  els.grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.card-media');
    if (!btn) return;
    const product = state.data.products.find((p) => p.id === btn.dataset.id);
    if (product) openModal(product);
  });

  els.modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));

  // account
  els.accountBtn.addEventListener('click', openAccountModal);
  els.accountModal.querySelectorAll('[data-close-account]').forEach((el) => el.addEventListener('click', closeAccountModal));
  els.accountBody.addEventListener('click', (e) => {
    const reorderBtn = e.target.closest('[data-reorder]');
    if (reorderBtn) reorderOrder(reorderBtn.dataset.reorder);
    const cancelBtn = e.target.closest('[data-cancel-order]');
    if (cancelBtn) cancelOrder(cancelBtn.dataset.cancelOrder);
  });

  // cart drawer
  els.cartBtn.addEventListener('click', openCart);
  els.cartDrawer.querySelectorAll('[data-close-cart]').forEach((el) => el.addEventListener('click', closeCart));
  els.checkoutBtn.addEventListener('click', checkout);
  els.cartItems.addEventListener('click', (e) => {
    const plus = e.target.closest('[data-qty-plus]');
    const minus = e.target.closest('[data-qty-minus]');
    const remove = e.target.closest('[data-remove]');
    if (plus) {
      const item = state.cartItems.find((i) => i.key === plus.dataset.qtyPlus);
      if (item) setCartQty(item.key, item.qty + 1);
    }
    if (minus) {
      const item = state.cartItems.find((i) => i.key === minus.dataset.qtyMinus);
      if (item) setCartQty(item.key, item.qty - 1);
    }
    if (remove) removeCartItem(remove.dataset.remove);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (els.modal.classList.contains('open')) closeModal();
    if (els.accountModal.classList.contains('open')) closeAccountModal();
    if (els.cartDrawer.classList.contains('open')) closeCart();
  });
}

init();
