let activeCategory = '臉部保養';
let activeSeries = '全部';

var cart = JSON.parse(localStorage.getItem('pola_cart') || '[]');
var agentInfo = null;
const SHOP_API = 'http://localhost:8001'; // TODO: replace with Railway URL after deploy
function renderColorSwatches(variants) {
  const thumbs = variants.map(v =>
    `<img src="${v.img}" alt="${v.label}" class="color-swatch-thumb"
      data-label="${v.label}" data-code="${v.code || ''}"
      onclick="event.stopPropagation();event.preventDefault();selectSwatch(this)">`
  ).join('');
  return `<div class="color-swatches">${thumbs}</div>
    <div class="var-active-info" style="min-height:18px">
      <span class="var-active-label"></span>
      <span class="var-active-code"></span>
    </div>`;
}

function selectSwatch(thumb) {
  const card = thumb.closest('.product-card');
  const mainImg = card.querySelector('.product-img-wrap img');
  const wasActive = thumb.classList.contains('active');

  card.querySelectorAll('.color-swatch-thumb').forEach(t => t.classList.remove('active'));

  if (wasActive) {
    if (mainImg) mainImg.src = card.dataset.heroImg;
    const label = card.querySelector('.var-active-label');
    const code  = card.querySelector('.var-active-code');
    if (label) label.textContent = '';
    if (code)  code.textContent  = '';
  } else {
    thumb.classList.add('active');
    if (mainImg) mainImg.src = thumb.src;
    const label = card.querySelector('.var-active-label');
    const code  = card.querySelector('.var-active-code');
    if (label) label.textContent = thumb.dataset.label;
    if (code)  code.textContent  = thumb.dataset.code || '';
  }
}

function renderSizeSwitcher(variants) {
  const first = variants[0];
  const n = variants.length;
  const inner = `<span class="var-label">${first.label}</span><span class="var-price">${first.price}</span><span class="var-code">${first.code}</span>`;
  return `<div class="variant-sw" data-vidx="0">
      <button class="var-btn" onclick="event.stopPropagation();event.preventDefault();varNav(this,-1)">&#8249;</button>
      <div class="var-info">${inner}</div>
      <button class="var-btn" onclick="event.stopPropagation();event.preventDefault();varNav(this,1)">&#8250;</button>
      <span class="var-count">1 / ${n}</span>
    </div>`;
}

function varNav(btn, dir) {
  const card = btn.closest('.product-card');
  const sw = btn.closest('.variant-sw');
  const pkey = card.dataset.pkey;
  const product = PRODUCTS.find(p => p.name === pkey);
  if (!product?.variants) return;
  const n = product.variants.length;
  const cur = (parseInt(sw.dataset.vidx) + dir + n) % n;
  sw.dataset.vidx = cur;
  const v = product.variants[cur];
  const labelEl = sw.querySelector('.var-label');
  if (labelEl) labelEl.textContent = v.label;
  const priceEl = sw.querySelector('.var-price');
  if (priceEl && v.price) priceEl.textContent = v.price;
  const codeEl = sw.querySelector('.var-code');
  if (codeEl) codeEl.textContent = v.code;
  const countEl = sw.querySelector('.var-count');
  if (countEl) countEl.textContent = `${cur+1} / ${n}`;
}

const SERIES_ORDER = {
  '臉部保養': ['全部','B.A grandluxe','B.A','WRINKLE SHOT','WHITE SHOT','Red B.A','ALLU 奧麗','WHITISSIMO 優皙','MOISTISSIMO 霧黛絲奧','D','POLISSIMA 新思美'],
  '彩妝':     ['全部','B.A 彩妝','diem couleur 花樣年華','WHITISSIMO 底妝'],
  '身體保養': ['全部','PENSÉE DE BOUQUET','SPARKLING BOUQUET','其他'],
  '頭髮護理': ['全部','GROWING SHOT','FORM 美顏塑髮'],
};

function getSeriesForCategory(cat) {
  const inData = [...new Set(PRODUCTS.filter(p => p.mainCategory === cat).map(p => p.series))];
  const ordered = (SERIES_ORDER[cat] || []).filter(s => s === '全部' || inData.includes(s));
  const extra = inData.filter(s => !ordered.includes(s));
  return [...ordered, ...extra];
}

function getFilteredProducts() {
  return PRODUCTS.filter(p => {
    if (p.mainCategory !== activeCategory) return false;
    if (activeSeries !== '全部' && p.series !== activeSeries) return false;
    return true;
  });
}

function renderSeriesFilter() {
  const bar = document.getElementById('seriesBar');
  const series = getSeriesForCategory(activeCategory);

  if (series.length <= 1) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  bar.innerHTML = series.map(s =>
    `<button class="series-pill${s === activeSeries ? ' active' : ''}" data-series="${s}">${s}</button>`
  ).join('');

  bar.querySelectorAll('.series-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSeries = btn.dataset.series;
      renderSeriesFilter();
      renderProducts();
    });
  });
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  const products = getFilteredProducts();

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <p>此系列商品即將上架</p>
      </div>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const isSizeVar  = p.variants && !!p.variants[0].price;
    const isColorVar = p.variants && !p.variants[0].price;
    return `
    <div class="product-card" data-pkey="${p.name}" data-hero-img="${p.img}">
      <a href="${p.url || '#'}" target="_blank" rel="noopener" style="display:contents">
      <div class="product-img-wrap">
        ${p.img ? `<img
          src="${p.img}"
          alt="${p.name}"
          loading="lazy"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
        >
        <div class="img-placeholder" style="display:none">POLA</div>` : `<div class="img-placeholder" style="display:flex">POLA</div>`}
      </div>
      <div class="product-info">
        <div class="product-top-row">
          <span class="product-series">${p.series}</span>
          ${p.code ? `<span class="product-code">${p.code}</span>` : ''}
        </div>
        <h3 class="product-name">${p.name}</h3>
        ${!isSizeVar ? `<div class="product-spec-row">
          ${p.size ? `<span class="product-size">${p.size}</span>` : ''}
          ${p.price ? `<span class="product-price">${p.price}</span>` : ''}
        </div>` : ''}
        ${isColorVar ? renderColorSwatches(p.variants) : ''}
        ${isSizeVar  ? renderSizeSwitcher(p.variants)  : ''}
        ${p.refill ? `<p class="product-refill">${p.refill}</p>` : ''}
        ${p.type ? `<p class="product-type">${p.type}</p>` : ''}
        ${(p.tagline || p.description) ? `<hr class="product-divider">` : ''}
        ${p.tagline ? `<p class="product-tagline">${p.tagline}</p>` : ''}
        ${p.description ? `<p class="product-desc">${p.description}</p>` : ''}
        ${p.usage ? `<p class="product-usage">${p.usage}</p>` : ''}
        ${p.footnotes && p.footnotes.length ? `
          <div class="product-footnotes">
            ${p.footnotes.map(f => `<p>${f}</p>`).join('')}
          </div>` : ''}
      </div>
      </a>
      <div class="product-cta-row" style="display:flex;border-top:1px solid #f0f0f0">
        <a href="${p.url || '#'}" target="_blank" rel="noopener"
          style="flex:1;padding:9px 12px;font-size:11px;color:#999;display:flex;align-items:center;justify-content:center;text-decoration:none;transition:color .15s"
          onmouseover="this.style.color='#333'" onmouseout="this.style.color='#999'">
          查看詳情 →
        </a>
        <button class="add-to-cart-btn"
          data-pkey="${p.name}"
          data-variant=""
          onclick="handleAddToCart(this, '${p.name}')"
          style="flex:1;border-left:1px solid #f0f0f0">加入收藏</button>
      </div>
    </div>`;
  }).join('');

  updateAddButtons();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeCategory = tab.dataset.cat;
    activeSeries = '全部';
    renderSeriesFilter();
    renderProducts();
  });
});

renderSeriesFilter();
renderProducts();

// Back-to-top visibility
const backToTopBtn = document.getElementById('backToTop');
window.addEventListener('scroll', () => {
  backToTopBtn.classList.toggle('visible', window.scrollY > 300);
}, { passive: true });

// ── Cart & Order System ────────────────────────────────────────

function saveCart() {
  localStorage.setItem('pola_cart', JSON.stringify(cart));
}

function parsePrice(str) {
  if (!str) return 0;
  return parseInt(str.replace(/[^0-9]/g, ''), 10) || 0;
}

function getCartSubtotal() {
  return cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);
}

function getDiscountAmount() {
  if (!agentInfo || agentInfo.discount_rate >= 1) return 0;
  return Math.round(getCartSubtotal() * (1 - agentInfo.discount_rate));
}

function updateCartFab() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const countEl = document.getElementById('cartCount');
  if (total > 0) {
    countEl.textContent = total;
    countEl.classList.remove('hidden');
  } else {
    countEl.classList.add('hidden');
  }
}

function renderCartItems() {
  const container = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');

  if (!cart.length) {
    container.innerHTML = '<div class="cart-empty">尚未加入任何商品</div>';
    footer.style.display = 'none';
    return;
  }

  footer.style.display = '';
  container.innerHTML = cart.map((item, idx) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-meta">${[item.series, item.variantLabel, item.code].filter(Boolean).join(' · ')}</div>
        <div class="cart-item-price">NTD ${item.unitPrice.toLocaleString()}</div>
      </div>
      <div class="cart-qty">
        <button class="qty-btn" onclick="changeQty(${idx}, -1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty(${idx}, 1)">+</button>
      </div>
    </div>
  `).join('');

  const subtotal = getCartSubtotal();
  const discount = getDiscountAmount();
  const total = subtotal - discount;

  document.getElementById('cartSubtotal').textContent = `NTD ${subtotal.toLocaleString()}`;

  const discountRow = document.getElementById('cartDiscountRow');
  if (discount > 0) {
    document.getElementById('cartDiscount').textContent = `-NTD ${discount.toLocaleString()}`;
    discountRow.style.display = '';
  } else {
    discountRow.style.display = 'none';
  }

  document.getElementById('cartTotal').textContent = `NTD ${total.toLocaleString()}`;
}

function changeQty(idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  saveCart();
  updateCartFab();
  renderCartItems();
  updateAddButtons();
}

function addToCart(product, unitPrice, variantLabel, code) {
  const key = `${product.name}__${variantLabel || ''}`;
  const existing = cart.find(i => i.key === key);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      key,
      name: product.name,
      series: product.series,
      variantLabel: variantLabel || null,
      code: code || product.code || null,
      unitPrice,
      qty: 1,
    });
  }
  saveCart();
  updateCartFab();
  renderCartItems();
  updateAddButtons();
}

function isInCart(productName, variantLabel) {
  const key = `${productName}__${variantLabel || ''}`;
  return cart.some(i => i.key === key);
}

function updateAddButtons() {
  document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    const pkey = btn.dataset.pkey;
    const variant = btn.dataset.variant || '';
    btn.classList.toggle('in-cart', isInCart(pkey, variant));
    btn.textContent = isInCart(pkey, variant) ? '已加入 ✓' : '加入收藏';
  });
}

function toggleCart() {
  const panel = document.getElementById('cartPanel');
  const overlay = document.getElementById('cartOverlay');
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    closeCart();
  } else {
    panel.classList.add('open');
    overlay.classList.add('open');
    renderCartItems();
  }
}

function closeCart() {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
}

function openCheckout() {
  closeCart();
  document.getElementById('checkoutOverlay').style.display = 'flex';
  document.getElementById('checkoutForm').style.display = '';
  document.getElementById('checkoutSuccess').style.display = 'none';
}

function closeCheckout() {
  document.getElementById('checkoutOverlay').style.display = 'none';
}

async function submitOrder() {
  const name = document.getElementById('co-name').value.trim();
  if (!name) { alert('請填寫姓名'); return; }

  const btn = document.getElementById('checkoutSubmitBtn');
  btn.disabled = true;
  btn.textContent = '送出中...';

  const payload = {
    agent_code: agentInfo ? agentInfo.code : null,
    customer_name: name,
    customer_phone: document.getElementById('co-phone').value.trim() || null,
    customer_address: document.getElementById('co-address').value.trim() || null,
    payment_method: document.getElementById('co-payment').value,
    shipping_fee: 0,
    notes: document.getElementById('co-notes').value.trim() || null,
    items: cart.map(i => ({
      product_code: i.code || null,
      product_name: i.name,
      product_series: i.series || null,
      variant_label: i.variantLabel || null,
      unit_price: i.unitPrice,
      quantity: i.qty,
    })),
  };

  try {
    const res = await fetch(`${SHOP_API}/api/orders`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('送出失敗');
    const order = await res.json();

    cart = [];
    saveCart();
    updateCartFab();

    document.getElementById('successOrderNum').textContent = order.order_number;
    document.getElementById('checkoutForm').style.display = 'none';
    document.getElementById('checkoutSuccess').style.display = '';
  } catch (e) {
    alert('送出失敗，請稍後再試');
  } finally {
    btn.disabled = false;
    btn.textContent = '送出訂單';
  }
}

// Load agent info from URL ?agent=xxx
async function initAgent() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('agent');
  if (!code) return;

  try {
    const res = await fetch(`${SHOP_API}/api/agents/${code}`);
    if (!res.ok) return;
    agentInfo = await res.json();

    const bar = document.getElementById('cartAgentBar');
    if (bar) {
      const discountLabel = agentInfo.discount_rate < 1
        ? `${Math.round(agentInfo.discount_rate * 10)}折優惠`
        : '原價';
      bar.innerHTML = `業務：<span>${agentInfo.name}</span>　折扣：<span>${discountLabel}</span>`;
      bar.style.display = '';
    }
  } catch (e) {
    // silently ignore
  }
}

function handleAddToCart(btn, productName) {
  const product = PRODUCTS.find(p => p.name === productName);
  if (!product) return;

  const card = btn.closest('.product-card');
  let unitPrice = 0;
  let variantLabel = null;
  let code = product.code || null;

  if (product.variants) {
    const isSizeVar = !!product.variants[0].price;
    if (isSizeVar) {
      const sw = card.querySelector('.variant-sw');
      const idx = sw ? parseInt(sw.dataset.vidx || '0') : 0;
      const v = product.variants[idx];
      unitPrice = parsePrice(v.price);
      variantLabel = v.label;
      code = v.code || code;
    } else {
      // color variant — use main product price
      unitPrice = parsePrice(product.price);
      const active = card.querySelector('.color-swatch-thumb.active');
      if (active) {
        variantLabel = active.dataset.label;
        code = active.dataset.code || code;
      }
    }
  } else {
    unitPrice = parsePrice(product.price);
  }

  if (!unitPrice) return;
  addToCart(product, unitPrice, variantLabel, code);
}

initAgent();
updateCartFab();
