let activeCategory = '臉部保養';
let activeSeries = '全部';

var cart = JSON.parse(localStorage.getItem('pola_cart') || '[]');
var agentInfo = null;
var agentModeInfo = null;
const SHOP_API = 'https://pola-shop-production.up.railway.app';

function updateNavTop() {
  const topBarH = document.getElementById('siteTopBar')?.offsetHeight || 57;
  const wrap = document.getElementById('stickyNavWrap');
  if (wrap) wrap.style.top = topBarH + 'px';
}

function formatPhone(phone) {
  if (!phone) return phone;
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('09')) return d.slice(0,4) + '-' + d.slice(4,7) + '-' + d.slice(7);
  if (d.length === 10) return d.slice(0,2) + '-' + d.slice(2,6) + '-' + d.slice(6);
  return phone;
}

function parseRefill(str) {
  const codeMatch = str.match(/序號\s*(\d+)/);
  const priceMatch = str.match(/NTD\s*([\d,]+)/);
  const label = str.replace(/NTD\s*[\d,]+/, '').replace(/（序號\s*\d+）/, '').replace(/\s+/g, ' ').trim();
  return {
    label,
    price: priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null,
    priceStr: priceMatch ? priceMatch[1] : null,
    code: codeMatch ? codeMatch[1] : null,
  };
}

function renderRefillSelect(p) {
  const r = parseRefill(p.refill);
  const isPowder = r.label.includes('盒');
  const mainName = isPowder ? '粉蕊' : '主裝';
  const mainCodePrefix = p.code ? p.code + '  ' : '';
  const mainLabel = `${mainCodePrefix}${mainName}${p.price ? '  ' + p.price : ''}`;
  const refillCodePrefix = r.code ? r.code + '  ' : '';
  const refillPriceStr = r.priceStr ? '  NTD ' + r.priceStr : '';
  const refillLabel = `${refillCodePrefix}${r.label}${refillPriceStr}`;
  const note = isPowder
    ? `<p style="font-size:11px;color:#aaa;margin:2px 0 4px;line-height:1.5">粉蕊及粉盒為分開販售</p>`
    : '';
  return `<select class="product-variant-select refill-select"
    onclick="event.stopPropagation();event.preventDefault()"
    onchange="event.stopPropagation();refillSelectChange(this)"
    data-refill-price="${r.price || ''}" data-refill-code="${r.code || ''}" data-refill-label="${r.label}"
    data-main-price="${p.price || ''}" data-main-code="${p.code || ''}"
    ${isPowder ? 'data-is-powder="1"' : ''}>
    <option value="main">${mainLabel}</option>
    <option value="refill">${refillLabel}</option>
  </select>${note}`;
}

function refillSelectChange(sel) {
  const card = sel.closest('.product-card');
  const priceEl = card.querySelector('.product-price');
  const codeEl = card.querySelector('.product-code');
  const swatches = card.querySelectorAll('.color-swatch-thumb');
  if (sel.value === 'refill') {
    const price = parseInt(sel.dataset.refillPrice);
    if (price && priceEl) priceEl.textContent = 'NTD ' + price.toLocaleString();
    if (sel.dataset.refillCode && codeEl) codeEl.textContent = sel.dataset.refillCode;
    if (sel.dataset.isPowder) swatches.forEach(t => t.style.display = 'none');
  } else {
    if (priceEl && sel.dataset.mainPrice) priceEl.textContent = sel.dataset.mainPrice;
    if (codeEl && sel.dataset.mainCode) codeEl.textContent = sel.dataset.mainCode;
    swatches.forEach(t => t.style.display = '');
  }
}

function seriesId(s) {
  return 'sec-' + s.replace(/[^\w一-鿿]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
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
  const opts = variants.map((v, i) => {
    const codePrefix = v.code ? v.code + '  ' : '';
    return `<option value="${i}">${codePrefix}${v.label}  ${v.price}</option>`;
  }).join('');
  return `<select class="product-variant-select variant-size-select"
    onclick="event.stopPropagation();event.preventDefault()"
    onchange="event.stopPropagation();varSizeChange(this)">
    ${opts}
  </select>`;
}

function varSizeChange(sel) {
  const card = sel.closest('.product-card');
  const pkey = card.dataset.pkey;
  const product = PRODUCTS.find(p => p.name === pkey);
  if (!product?.variants) return;
  const v = product.variants[parseInt(sel.value)];
  const codeEl = card.querySelector('.product-code');
  if (codeEl && v.code) codeEl.textContent = v.code;
  updateQtyDisplays();
}

const SERIES_DISPLAY = {
  'WHITE SHOT': 'WHITE SHOT 擊速煥白',
  'PENSÉE DE BOUQUET': 'PENSÉE DE BOUQUET 沁香',
  'SPARKLING BOUQUET': 'SPARKLING BOUQUET 燦爛花園',
};

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
  return PRODUCTS.filter(p => p.mainCategory === activeCategory);
}

function renderSeriesFilter() {
  const bar = document.getElementById('seriesBar');
  const series = getSeriesForCategory(activeCategory).filter(s => s !== '全部');

  if (series.length <= 1) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  bar.classList.remove('nav-collapse');
  bar.innerHTML = series.map(s =>
    `<button class="series-pill" data-series="${s}">${SERIES_DISPLAY[s] || s}</button>`
  ).join('');

  bar.querySelectorAll('.series-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = seriesId(btn.dataset.series);
      const el = document.getElementById(sid);
      if (el) {
        const navH = document.querySelector('.sticky-nav-wrap')?.offsetHeight || 0;
        const headerH = document.querySelector('header')?.offsetHeight || 57;
        const top = el.getBoundingClientRect().top + window.scrollY - navH - headerH;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    });
  });
}

function renderProductCard(p) {
  const isSizeVar  = p.variants && !!p.variants[0].price;
  const isColorVar = p.variants && !p.variants[0].price;
  const pname = p.name.replace(/'/g, "\\'");
  return `
  <div class="product-card" data-pkey="${p.name}" data-hero-img="${p.img || ''}">
    <a href="${p.url || '#'}" target="_blank" rel="noopener" style="display:contents">
    <div class="product-img-wrap">
      ${p.img ? `<img src="${p.img}" alt="${p.name}" loading="lazy"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="img-placeholder" style="display:none">POLA</div>`
        : `<div class="img-placeholder" style="display:flex">POLA</div>`}
    </div>
    <div class="product-info">
      <div class="product-header-zone">
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
        ${p.refill ? renderRefillSelect(p) : ''}
        ${p.type ? `<p class="product-type">${p.type}</p>` : ''}
      </div>
      ${(p.tagline || p.description) ? `<hr class="product-divider">` : ''}
      ${p.tagline ? `<p class="product-tagline">${p.tagline}</p>` : ''}
      ${p.description ? `<p class="product-desc">${p.description}</p>` : ''}
      ${p.usage ? `<p class="product-usage">${p.usage}</p>` : ''}
      ${p.footnotes && p.footnotes.length ? `
        <div class="product-footnotes">${p.footnotes.map(f => `<p>${f}</p>`).join('')}</div>` : ''}
    </div>
    </a>
    <div class="product-cta-row" style="display:flex;border-top:1px solid #f0f0f0">
      <a href="${p.url || '#'}" target="_blank" rel="noopener"
        style="flex:1;padding:9px 12px;font-size:11px;color:#999;display:flex;align-items:center;justify-content:center;text-decoration:none;transition:color .15s"
        onmouseover="this.style.color='#333'" onmouseout="this.style.color='#999'">
        查看詳情 →
      </a>
      <div class="card-qty-ctrl" data-pkey="${p.name}">
        <button class="cqc-minus" style="display:none" onclick="event.stopPropagation();cardQtyChange(this,'${pname}',-1)">−</button>
        <span class="cqc-num" style="display:none">0</span>
        <button class="cqc-plus add-label" onclick="event.stopPropagation();cardQtyChange(this,'${pname}',1)">+ 加入</button>
      </div>
    </div>
  </div>`;
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  const products = getFilteredProducts();

  if (products.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="padding:80px 20px;text-align:center;color:#bbb;width:100%">
      <p style="font-size:15px;margin-bottom:8px">此分類商品即將上架</p></div>`;
    return;
  }

  const seriesOrder = getSeriesForCategory(activeCategory).filter(s => s !== '全部');
  const grouped = {};
  seriesOrder.forEach(s => { grouped[s] = []; });
  products.forEach(p => {
    if (!grouped[p.series]) grouped[p.series] = [];
    grouped[p.series].push(p);
  });

  grid.innerHTML = seriesOrder
    .filter(s => grouped[s] && grouped[s].length)
    .map(s => `
      <div class="series-section" id="${seriesId(s)}">
        <h2 class="series-heading">${SERIES_DISPLAY[s] || s}</h2>
        <div class="series-products">
          ${grouped[s].map(p => renderProductCard(p)).join('')}
        </div>
      </div>`)
    .join('');

  updateQtyDisplays();
  requestAnimationFrame(equalizeHeaderZones);
}

function equalizeHeaderZones() {
  const zones = [...document.querySelectorAll('.product-header-zone')];
  zones.forEach(z => z.style.minHeight = '');
  if (!zones.length) return;
  const rows = new Map();
  zones.forEach(z => {
    const top = Math.round(z.getBoundingClientRect().top);
    if (!rows.has(top)) rows.set(top, []);
    rows.get(top).push(z);
  });
  rows.forEach(group => {
    const maxH = Math.max(...group.map(z => z.offsetHeight));
    group.forEach(z => z.style.minHeight = maxH + 'px');
  });
}

let _eqResizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_eqResizeTimer);
  _eqResizeTimer = setTimeout(equalizeHeaderZones, 150);
});

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

(async () => {
  try {
    const res = await fetch(`${SHOP_API}/api/settings/products`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        PRODUCTS.splice(0, PRODUCTS.length, ...data);
      }
    }
  } catch (e) {}
  renderSeriesFilter();
  renderProducts();
})();

// Back-to-top + series bar hide/show + active pill
const backToTopBtn = document.getElementById('backToTop');
let lastScrollY = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  backToTopBtn.classList.toggle('visible', y > 300);

  // Series bar hide on scroll down, show on scroll up
  const seriesBarEl = document.getElementById('seriesBar');
  if (seriesBarEl && !seriesBarEl.classList.contains('hidden')) {
    if (y > lastScrollY && y > 80) {
      seriesBarEl.classList.add('nav-collapse');
    } else {
      seriesBarEl.classList.remove('nav-collapse');
    }
  }

  // Update active series pill based on visible section
  const sections = document.querySelectorAll('.series-section');
  const navH = (document.querySelector('.sticky-nav-wrap')?.offsetHeight || 0) +
               (document.querySelector('header')?.offsetHeight || 57) + 20;
  let currentSeries = '';
  sections.forEach(sec => {
    if (sec.getBoundingClientRect().top <= navH) currentSeries = sec.id;
  });
  if (currentSeries) {
    document.querySelectorAll('.series-pill').forEach(pill => {
      pill.classList.toggle('active', seriesId(pill.dataset.series) === currentSeries);
    });
  }

  lastScrollY = y <= 0 ? 0 : y;
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
        <div class="cart-item-price" style="color:#aaa;font-size:12px">參考原價 NTD ${item.unitPrice.toLocaleString()}</div>
      </div>
      <div class="cart-qty">
        <button class="qty-btn" onclick="changeQty(${idx}, -1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty(${idx}, 1)">+</button>
      </div>
    </div>
  `).join('');
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

function getCardVariantKey(card, productName) {
  const product = PRODUCTS.find(p => p.name === productName);
  if (!product || !product.variants) return '';
  const isSizeVar = !!product.variants[0].price;
  if (isSizeVar) {
    const sel = card.querySelector('.variant-size-select');
    const idx = sel ? parseInt(sel.value || '0') : 0;
    return product.variants[idx]?.label || '';
  }
  const active = card.querySelector('.color-swatch-thumb.active');
  return active ? (active.dataset.label || '') : '';
}

function updateQtyDisplays() {
  document.querySelectorAll('.card-qty-ctrl').forEach(ctrl => {
    const pkey = ctrl.dataset.pkey;
    const card = ctrl.closest('.product-card');
    const vkey = getCardVariantKey(card, pkey);
    const key = `${pkey}__${vkey}`;
    const item = cart.find(i => i.key === key);
    const qty = item ? item.qty : 0;
    const minus = ctrl.querySelector('.cqc-minus');
    const num = ctrl.querySelector('.cqc-num');
    const plus = ctrl.querySelector('.cqc-plus');
    if (qty > 0) {
      minus.style.display = '';
      num.style.display = '';
      num.textContent = qty;
      plus.textContent = '+';
      plus.classList.remove('add-label');
    } else {
      minus.style.display = 'none';
      num.style.display = 'none';
      plus.textContent = '+ 加入';
      plus.classList.add('add-label');
    }
  });
}

function cardQtyChange(btn, productName, delta) {
  const product = PRODUCTS.find(p => p.name === productName);
  if (!product) return;
  const card = btn.closest('.product-card');
  let vkey = '', variantLabel = null, code = product.code || null, unitPrice = 0;

  if (product.variants) {
    const isSizeVar = !!product.variants[0].price;
    if (isSizeVar) {
      const sel = card.querySelector('.variant-size-select');
      const idx = sel ? parseInt(sel.value || '0') : 0;
      const v = product.variants[idx];
      unitPrice = parsePrice(v.price);
      variantLabel = v.label;
      code = v.code || code;
      vkey = variantLabel || '';
    } else {
      unitPrice = parsePrice(product.price);
      const active = card.querySelector('.color-swatch-thumb.active');
      if (active) { variantLabel = active.dataset.label; code = active.dataset.code || code; vkey = variantLabel || ''; }
    }
  } else {
    unitPrice = parsePrice(product.price);
  }

  const refillSel = card.querySelector('.refill-select');
  if (refillSel && refillSel.value === 'refill') {
    const refillPrice = parseInt(refillSel.dataset.refillPrice);
    if (refillPrice) unitPrice = refillPrice;
    code = refillSel.dataset.refillCode || code;
    variantLabel = refillSel.dataset.refillLabel || null;
    vkey = variantLabel || '';
  }

  if (!unitPrice && delta > 0) return;
  const key = `${productName}__${vkey}`;
  const existing = cart.find(i => i.key === key);

  if (delta > 0) {
    if (existing) { existing.qty += 1; }
    else { cart.push({ key, name: product.name, series: product.series, variantLabel, code, unitPrice, qty: 1 }); }
  } else if (existing) {
    existing.qty -= 1;
    if (existing.qty <= 0) cart.splice(cart.indexOf(existing), 1);
  }

  saveCart();
  updateCartFab();
  renderCartItems();
  updateQtyDisplays();
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
  if (customerToken && _customerData) {
    document.getElementById('co-buyer-section').style.display = '';
    document.getElementById('co-buyer-info').textContent = `${_customerData.name}　${_customerData.phone}`;
    document.getElementById('sameBuyerBtn').style.display = '';
    document.getElementById('co-name').value = _customerData.name || '';
    document.getElementById('co-phone').value = _customerData.phone || '';
    document.getElementById('co-address').value = _customerData.address || '';
  } else {
    document.getElementById('co-buyer-section').style.display = 'none';
    document.getElementById('sameBuyerBtn').style.display = 'none';
  }
}

function fillSameBuyer() {
  if (!_customerData) return;
  document.getElementById('co-name').value = _customerData.name || '';
  document.getElementById('co-phone').value = _customerData.phone || '';
  document.getElementById('co-address').value = _customerData.address || '';
}

function closeCheckout() {
  document.getElementById('checkoutOverlay').style.display = 'none';
}

// ── Checkout helpers ──────────────────────────────────────────

async function lookupPhone(phone) {
  const display = document.getElementById('co-agent-display');
  if (!phone || phone.length < 8) { display.style.display = 'none'; return; }
  if (agentModeInfo) {
    display.style.display = '';
    display.textContent = `顧問：${agentModeInfo.name}（顧問下單模式）`;
    return;
  }
  try {
    const res = await fetch(`${SHOP_API}/api/customers/lookup?phone=${encodeURIComponent(phone)}`);
    const data = await res.json();
    if (data.found) {
      display.style.display = '';
      display.textContent = `已記錄您的顧問：${data.agent_name}`;
    } else {
      display.style.display = 'none';
    }
  } catch (e) {
    display.style.display = 'none';
  }
}

async function lookupAgentCode() {
  const codeInput = document.getElementById('co-agent-code');
  const display = document.getElementById('co-agent-code-display');
  const code = codeInput.value.trim().toUpperCase();
  if (!code) { display.style.display = 'none'; return; }
  try {
    const res = await fetch(`${SHOP_API}/api/agents/${code}`);
    if (!res.ok) { display.style.display = ''; display.style.color = '#e53e3e'; display.textContent = '找不到此顧問代碼'; return; }
    const agent = await res.json();
    display.style.display = '';
    display.style.color = '#19884a';
    display.textContent = `顧問：${agent.name}`;
  } catch (e) {
    display.style.display = 'none';
  }
}

async function submitOrder() {
  const name = document.getElementById('co-name').value.trim();
  const phone = document.getElementById('co-phone').value.trim();
  const address = document.getElementById('co-address').value.trim();
  if (!name) { alert('請填寫姓名'); return; }
  if (!phone) { alert('請填寫電話'); return; }
  if (!address) { alert('請填寫寄送地址'); return; }

  const btn = document.getElementById('checkoutSubmitBtn');
  btn.disabled = true;
  btn.textContent = '送出中...';

  const formAgentCode = document.getElementById('co-agent-code').value.trim().toUpperCase() || null;
  const agentCode = agentModeInfo ? agentModeInfo.code : formAgentCode;

  const payload = {
    agent_code: agentCode,
    customer_name: name,
    customer_phone: phone,
    customer_address: address || null,
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

    const agentName = order.agent_name || agentModeInfo?.name;
    document.getElementById('successAgentMsg').textContent = agentName
      ? `顧問 ${agentName} 會盡快與您確認金額及出貨安排。`
      : '收到您的詢單！顧問會盡快與您聯繫確認。';
    document.getElementById('successOrderNum').textContent = `訂單編號：${order.order_number}`;
    document.getElementById('checkoutForm').style.display = 'none';
    document.getElementById('checkoutSuccess').style.display = '';
  } catch (e) {
    alert('送出失敗，請稍後再試');
  } finally {
    btn.disabled = false;
    btn.textContent = '送出詢單';
  }
}

// ── Portal ────────────────────────────────────────────────────

var customerToken = sessionStorage.getItem('customerToken') || null;
var _customerData = null;
var _customerOrders = [];

function openPortal(tab = 'customer') {
  document.getElementById('portalOverlay').classList.add('open');
  switchPortalTab(tab);
  if (tab === 'customer' && customerToken) loadCustomerProfile();
  if (tab === 'agent' && agentModeInfo) renderAgentDashboard(agentModeInfo.code);
}

function closePortal() {
  document.getElementById('portalOverlay').classList.remove('open');
}

function closePortalIfBg(e) {
  if (e.target === document.getElementById('portalOverlay')) closePortal();
}

function switchPortalTab(tab) {
  document.getElementById('portalTabCustomer').classList.toggle('active', tab === 'customer');
  document.getElementById('portalTabAgent').classList.toggle('active', tab === 'agent');
  document.getElementById('portalCustomerTab').style.display = tab === 'customer' ? '' : 'none';
  document.getElementById('portalAgentTab').style.display = tab === 'agent' ? '' : 'none';
}

// ── Customer auth ─────────────────────────────────────────────

function showCustomerLogin() {
  document.getElementById('portalCustomerRegister').style.display = 'none';
  document.getElementById('portalCustomerProfile').style.display = 'none';
  document.getElementById('portalCustomerLogin').style.display = '';
}

function showCustomerRegister() {
  document.getElementById('portalCustomerLogin').style.display = 'none';
  document.getElementById('portalCustomerProfile').style.display = 'none';
  document.getElementById('portalCustomerRegister').style.display = '';
}

async function submitCustomerLogin() {
  const phone = document.getElementById('customerPhone').value.trim();
  const password = document.getElementById('customerPassword').value;
  const err = document.getElementById('customerErr');
  if (!phone || !password) { err.textContent = '請輸入電話和密碼'; return; }
  err.textContent = '';
  try {
    const res = await fetch(`${SHOP_API}/api/customers/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.detail || '登入失敗'; return; }
    customerToken = data.token;
    sessionStorage.setItem('customerToken', customerToken);
    await loadCustomerProfile();
  } catch (e) {
    err.textContent = '連線失敗，請稍後再試';
  }
}

async function submitCustomerRegister() {
  const phone = document.getElementById('regPhone').value.trim();
  const name = document.getElementById('regName').value.trim();
  const address = document.getElementById('regAddress').value.trim();
  const agent_code = document.getElementById('regAgentCode').value.trim();
  const password = document.getElementById('regPassword').value;
  const password2 = document.getElementById('regPassword2').value;
  const err = document.getElementById('regErr');
  if (!phone || !name || !password) { err.textContent = '請填寫必填欄位（*）'; return; }
  if (password !== password2) { err.textContent = '兩次密碼不一致'; return; }
  err.textContent = '';
  try {
    const res = await fetch(`${SHOP_API}/api/customers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, name, address, agent_code, password }),
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.detail || '註冊失敗'; return; }
    customerToken = data.token;
    sessionStorage.setItem('customerToken', customerToken);
    await loadCustomerProfile();
  } catch (e) {
    err.textContent = '連線失敗，請稍後再試';
  }
}

async function loadCustomerProfile() {
  if (!customerToken) return;
  try {
    const res = await fetch(`${SHOP_API}/api/customers/me?token=${encodeURIComponent(customerToken)}`);
    if (!res.ok) {
      customerToken = null;
      sessionStorage.removeItem('customerToken');
      showCustomerLogin();
      return;
    }
    const data = await res.json();
    _customerData = data;
    document.getElementById('profileName').textContent = data.name;
    document.getElementById('profilePhone').textContent = data.phone;
    document.getElementById('profileMonthly').textContent = fmtNTD(data.monthly_retail);
    document.getElementById('profileTotal').textContent = fmtNTD(data.total_retail);

    _customerOrders = data.orders.slice(0, 20);
    const ordersEl = document.getElementById('profileOrders');
    if (!_customerOrders.length) {
      ordersEl.innerHTML = '<div style="color:#aaa;font-size:13px;padding:8px 0">尚無訂單記錄</div>';
    } else {
      ordersEl.innerHTML = _customerOrders.slice(0, 8).map((o, idx) => `
        <div class="portal-order-item" style="flex-direction:column;align-items:stretch;cursor:pointer" onclick="showOrderDetail(${idx})">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <span style="font-weight:600">${o.order_number}</span>
            <span style="font-weight:600">NTD ${(o.retail_total || 0).toLocaleString()}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:2px">
            <span style="font-size:11px;color:#aaa">${(o.created_at || '').slice(0,10)}</span>
            <span style="font-size:11px;color:${statusColor(o.status)}">${o.status}</span>
          </div>
        </div>`).join('');
    }

    document.getElementById('portalCustomerLogin').style.display = 'none';
    document.getElementById('portalCustomerRegister').style.display = 'none';
    document.getElementById('portalCustomerProfile').style.display = '';
  } catch (e) {
    console.error(e);
  }
}

function showEditProfile() {
  document.getElementById('editName').value = _customerData?.name || '';
  document.getElementById('editPhone').value = _customerData?.phone || '';
  document.getElementById('editAddress').value = _customerData?.address || '';
  document.getElementById('editNewPassword').value = '';
  document.getElementById('editNewPassword2').value = '';
  document.getElementById('editErr').textContent = '';
  document.getElementById('editProfilePanel').style.display = '';
  document.getElementById('editProfileBtn').style.display = 'none';
}

function cancelEditProfile() {
  document.getElementById('editProfilePanel').style.display = 'none';
  document.getElementById('editProfileBtn').style.display = '';
}

async function saveCustomerProfile() {
  const btn = document.getElementById('saveProfileBtn');
  const err = document.getElementById('editErr');
  const address = document.getElementById('editAddress').value.trim();
  const newPwd = document.getElementById('editNewPassword').value;
  const newPwd2 = document.getElementById('editNewPassword2').value;
  if (newPwd || newPwd2) {
    if (newPwd !== newPwd2) { err.textContent = '兩次密碼不一致'; return; }
    if (newPwd.length < 6) { err.textContent = '密碼至少 6 位'; return; }
  }
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = '儲存中…';
  const body = { token: customerToken, address };
  if (newPwd) body.new_password = newPwd;
  try {
    const res = await fetch(`${SHOP_API}/api/customers/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (_customerData) _customerData.address = data.address;
    btn.textContent = '已儲存 ✓';
    setTimeout(() => {
      btn.textContent = '儲存';
      btn.disabled = false;
      document.getElementById('editProfilePanel').style.display = 'none';
      document.getElementById('editProfileBtn').style.display = '';
    }, 1500);
  } catch (e) {
    err.textContent = '儲存失敗，請稍後再試';
    btn.textContent = '儲存';
    btn.disabled = false;
  }
}

async function resetCustomerProfile() {
  if (customerToken) {
    try {
      await fetch(`${SHOP_API}/api/customers/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customerToken }),
      });
    } catch (e) {}
  }
  customerToken = null;
  _customerData = null;
  sessionStorage.removeItem('customerToken');
  document.getElementById('customerPhone').value = '';
  document.getElementById('customerPassword').value = '';
  showCustomerLogin();
}

function fmtNTD(n) { return 'NTD ' + Math.round(n || 0).toLocaleString(); }

function statusColor(s) {
  return { '待確認': '#f59e0b', '已確認': '#16a34a', '已出貨': '#2563eb', '已取消': '#9ca3af' }[s] || '#9ca3af';
}

function showOrderDetail(idx) {
  const o = _customerOrders[idx];
  if (!o) return;
  document.getElementById('odTitle').textContent = `訂單 ${o.order_number}`;
  document.getElementById('odDate').textContent = (o.created_at || '').replace('T', ' ').slice(0, 16);
  const color = statusColor(o.status);
  document.getElementById('odRows').innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
      <span style="display:inline-flex;align-items:center;gap:6px;background:${color}22;color:${color};border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600">
        <span style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block"></span>${o.status}
      </span>
    </div>`;
  document.getElementById('odItems').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:4px 12px;font-size:12px;color:#aaa;border-bottom:1px solid #f0f0f0;padding-bottom:6px;margin-bottom:4px">
      <span>商品</span><span style="text-align:right">數量</span><span style="text-align:right">單價</span>
    </div>
    ${o.items.map(i => `
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:4px 12px;font-size:13px;color:#444;padding:7px 0;border-bottom:1px solid #f5f5f5">
        <div>
          <div>${i.product_name}</div>
          ${i.variant_label ? `<div style="font-size:11px;color:#aaa;margin-top:2px">${i.variant_label}</div>` : ''}
        </div>
        <div style="text-align:right;align-self:center;white-space:nowrap">×${i.quantity}</div>
        <div style="text-align:right;align-self:center;white-space:nowrap">NTD ${(i.unit_price || 0).toLocaleString()}</div>
      </div>`).join('')}`;
  document.getElementById('odTotal').textContent = `NTD ${(o.retail_total || 0).toLocaleString()}`;
  document.getElementById('orderDetailOverlay').classList.add('open');
}

function closeOrderDetail() {
  document.getElementById('orderDetailOverlay').classList.remove('open');
}

// ── Agent login / dashboard ───────────────────────────────────

async function submitAgentLogin() {
  const phone = document.getElementById('agentLoginPhone').value.trim();
  const pwd = document.getElementById('agentLoginPwd').value;
  const err = document.getElementById('agentLoginErr');
  if (!phone) { err.textContent = '請輸入電話號碼'; return; }
  if (!pwd) { err.textContent = '請輸入密碼'; return; }
  err.textContent = '';
  try {
    const res = await fetch(`${SHOP_API}/api/auth/agent`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ phone, password: pwd }),
    });
    if (!res.ok) { err.textContent = '電話或密碼不正確'; return; }
    const agent = await res.json();
    agentModeInfo = { code: agent.code, name: agent.name };
    sessionStorage.setItem('agentMode', JSON.stringify(agentModeInfo));
    document.getElementById('agentModeName').textContent = agent.name;
    document.getElementById('agentModeBanner').style.display = '';
    updateNavTop();
    renderAgentDashboard(agent.code, agent);
  } catch (e) {
    err.textContent = '連線失敗，請稍後再試';
  }
}

async function renderAgentDashboard(code, agentData) {
  document.getElementById('portalAgentLogin').style.display = 'none';
  document.getElementById('portalAgentDashboard').style.display = '';

  try {
    const res = await fetch(`${SHOP_API}/api/agents/${code}/stats`);
    const data = await res.json();
    const agent = agentData || data.agent;
    const tierLabel = agent.agent_type === 'store' ? '店家顧問' : `T${agent.current_tier} 個人顧問`;
    const discountLabel = `${Math.round((agent.discount_rate || 0.8) * 10)}折進貨`;

    document.getElementById('dashName').textContent = agent.name;
    document.getElementById('dashTierBadge').textContent = tierLabel;
    document.getElementById('dashDiscount').textContent = `${discountLabel} · ${agent.code}`;
    document.getElementById('dashMonthly').textContent = fmtNTD(data.monthly_retail);
    document.getElementById('dashTotal').textContent = fmtNTD(data.total_retail);
    document.getElementById('dashMonthlyOrders').textContent = data.monthly_order_count;
    document.getElementById('dashCustomers').textContent = data.customer_count;

    const ordersEl = document.getElementById('dashOrders');
    if (!data.recent_orders.length) {
      ordersEl.innerHTML = '<div style="color:#aaa;font-size:13px;padding:8px 0">本月尚無訂單</div>';
    } else {
      ordersEl.innerHTML = data.recent_orders.slice(0, 6).map(o => `
        <div class="portal-order-item">
          <div>
            <div style="font-weight:600">${o.order_number}</div>
            <div style="font-size:11px;color:#aaa">${(o.created_at || '').slice(0,10)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:600">NTD ${(o.retail_total || 0).toLocaleString()}</div>
            <div style="font-size:11px;color:#aaa">${o.status}</div>
          </div>
        </div>`).join('');
    }
  } catch (e) {
    document.getElementById('dashOrders').innerHTML = '<div style="color:#aaa;font-size:13px">載入失敗</div>';
  }
}

function logoutPortalAgent() {
  logoutAgentMode();
  document.getElementById('portalAgentLogin').style.display = '';
  document.getElementById('portalAgentDashboard').style.display = 'none';
  document.getElementById('agentLoginPhone').value = '';
  document.getElementById('agentLoginPwd').value = '';
  document.getElementById('agentLoginErr').textContent = '';
}

function logoutAgentMode() {
  agentModeInfo = null;
  sessionStorage.removeItem('agentMode');
  document.getElementById('agentModeBanner').style.display = 'none';
  updateNavTop();
}

async function initAgent() {
  const saved = sessionStorage.getItem('agentMode');
  if (saved) {
    try {
      agentModeInfo = JSON.parse(saved);
      document.getElementById('agentModeName').textContent = agentModeInfo.name;
      document.getElementById('agentModeBanner').style.display = '';
    } catch (e) { sessionStorage.removeItem('agentMode'); }
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
      const sel = card.querySelector('.variant-size-select');
      const idx = sel ? parseInt(sel.value || '0') : 0;
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
updateNavTop();
window.addEventListener('resize', updateNavTop, { passive: true });
