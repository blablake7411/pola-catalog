let activeCategory = '臉部保養';
let activeSeries = '全部';
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
    <a href="${p.url || '#'}" target="_blank" rel="noopener" class="product-card" data-pkey="${p.name}" data-hero-img="${p.img}">
      <div class="product-img-wrap">
        <img
          src="${p.img}"
          alt="${p.name}"
          loading="lazy"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
        >
        <div class="img-placeholder" style="display:none">POLA</div>
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
      <div class="product-cta">查看詳情 →</div>
    </a>`;
  }).join('');
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
