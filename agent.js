// ─────────────────────────────────────────────────────────────
// Agent dashboard logic
// ─────────────────────────────────────────────────────────────

// Determine which agent is "logged in" (URL ?agent=A002, default A002)
const params = new URLSearchParams(window.location.search);
let currentAgentCode = params.get('agent') || 'A002';
let currentAgent = AGENTS.find(a => a.code === currentAgentCode) || AGENTS[1];

function init() {
  // Populate agent switcher (demo only — in real app you'd login)
  const sel = document.getElementById('agentSwitch');
  AGENTS.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.code;
    opt.textContent = `切換：${a.name} (${a.code})`;
    if (a.code === currentAgent.code) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    window.location.search = '?agent=' + sel.value;
  });

  renderEverything();
}

function renderEverything() {
  const stats = agentMonthlyStats(currentAgent.code, ORDERS);
  const currentRule = TIER_RULES.find(t => t.tier === currentAgent.currentTier);
  const calcTier = getTierByMonthlyRetail(stats.retailSum);
  const next = getNextTier(calcTier.tier);

  // Welcome
  document.getElementById('agentName').textContent = currentAgent.name;
  document.getElementById('tierPill').innerHTML =
    `<span style="opacity:.6">●</span> T${currentAgent.currentTier} · ${currentRule.name} · ${currentRule.discount * 10}折進貨`;

  document.getElementById('wsRetail').textContent = fmt(stats.retailSum);
  document.getElementById('wsOrders').textContent = stats.orderCount;
  document.getElementById('wsPayable').textContent = fmt(stats.agentCostSum);
  document.getElementById('wsMargin').textContent =
    'NTD ' + ((1 - currentRule.discount) * 10000).toLocaleString();

  // Tier ladder
  renderLadder(calcTier, stats.retailSum);

  // Progress
  const tierMin = calcTier.minRetail;
  const tierMax = next ? next.minRetail : tierMin * 1.5;
  const progress = Math.min(100, ((stats.retailSum - tierMin) / (tierMax - tierMin)) * 100);
  document.getElementById('progressFill').style.width = progress + '%';
  document.getElementById('progressNow').textContent = '↑ ' + fmt(stats.retailSum);
  document.getElementById('progressMax').textContent = next ? fmt(next.minRetail) : fmt(tierMax);

  // Progress CTA
  const cta = document.getElementById('progressCta');
  if (next) {
    const remaining = next.minRetail - stats.retailSum;
    document.getElementById('nextTarget').innerHTML =
      `距離 <strong>T${next.tier} ${next.name}</strong> 還差 <strong class="mono">${fmt(remaining)}</strong>`;
    cta.classList.remove('maxed');
    cta.innerHTML = `
      升上 <strong>T${next.tier}</strong> 後進貨折扣變成 <strong>${next.discount * 10}折</strong>，
      同樣 NTD 10,000 原價的單，你可以多賺 <strong>NTD ${((next.discount === 0.75 ? 0.05 : 0.05) * 10000).toLocaleString()}</strong>！
    `;
  } else {
    document.getElementById('nextTarget').innerHTML = `<strong style="color:#19884a">已達最高階</strong>`;
    cta.classList.add('maxed');
    cta.innerHTML = `🏆 你已達最高階 <strong>T3 資深</strong>，享 7 折進貨價，每萬元原價賺 3,000。`;
  }

  // Mismatch warning for next month
  if (calcTier.tier !== currentAgent.currentTier) {
    const arrow = calcTier.tier > currentAgent.currentTier ? '↑' : '↓';
    cta.innerHTML += `<br><span style="font-size:12px;opacity:.85">📅 依本月業績，下個月 1 號將自動調整至 <strong>T${calcTier.tier}</strong> ${arrow}</span>`;
  }

  // Agent link
  const baseUrl = window.location.origin + window.location.pathname.replace('agent.html', 'index.html');
  document.getElementById('agentLink').textContent = `index.html?agent=${currentAgent.code}`;

  // Payable
  document.getElementById('payRetail').textContent = fmt(stats.retailSum);
  document.getElementById('payDiscount').textContent =
    `${currentRule.discount * 10}折 (−${fmt(stats.retailSum - stats.agentCostSum)})`;
  document.getElementById('payTotal').textContent = fmt(stats.agentCostSum);

  // Orders
  renderOrders();
}

function renderLadder(calcTier, retailSum) {
  const ladder = document.getElementById('ladder');
  ladder.innerHTML = TIER_RULES.map(t => {
    let cls = '';
    if (t.tier === calcTier.tier) cls = 'active';
    else if (t.tier < calcTier.tier) cls = 'passed';
    return `
      <div class="ladder-step ${cls}">
        <div class="lab">T${t.tier} · ${t.name}</div>
        <div class="range">${t.discount * 10}折 · ${formatRange(t)}</div>
      </div>
    `;
  }).join('');
}

function formatRange(t) {
  if (t.maxRetail === Infinity) return '14 萬+';
  if (t.minRetail === 0) return '0 – 7 萬';
  return '7 – 14 萬';
}

function renderOrders() {
  const myOrders = ORDERS
    .filter(o => o.agentCode === currentAgent.code)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  document.getElementById('orderCountSub').textContent = `共 ${myOrders.length} 筆`;
  const list = document.getElementById('ordersList');

  if (!myOrders.length) {
    list.innerHTML = `<div class="empty">本月還沒有訂單，分享你的專屬連結給客人開始接單！</div>`;
    return;
  }

  list.innerHTML = myOrders.map(o => {
    const retail = orderRetail(o);
    const cost = orderAgentCost(o);
    const itemsSum = o.items.length === 1
      ? o.items[0].name
      : `${o.items[0].name} 等 ${o.items.length} 項`;
    return `
      <div class="order-card" onclick="openDrawer('${o.orderNumber}')">
        <div class="order-row1">
          <div class="order-meta">
            <span class="num">${o.orderNumber}</span>
            <span class="date">${o.createdAt}</span>
            <span class="status ${o.status}">${o.status}</span>
          </div>
          <div class="order-amount">
            <div class="retail mono">原價 ${fmt(retail)}</div>
            <div class="agent-cost mono">${fmt(cost)}</div>
          </div>
        </div>
        <div class="order-row2">
          <span class="order-customer">${o.customerName} · ${o.customerPhone || '無電話'}</span>
          <span class="order-items-sum">${itemsSum}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ── Drawer ───────────────────────────────────────────────────
function openDrawer(orderNumber) {
  const o = ORDERS.find(x => x.orderNumber === orderNumber);
  if (!o) return;

  document.getElementById('drawerTitle').textContent = `訂單 ${o.orderNumber}`;
  document.getElementById('drawerSub').textContent = `${o.createdAt} · ${o.status}`;

  const itemsHTML = o.items.map(i => {
    const subRetail = i.unitRetail * i.qty;
    const subCost = Math.round(subRetail * o.agentDiscount);
    return `
      <div class="item-row">
        <div style="flex:1">
          <div>${i.name}</div>
          <div style="font-size:11px;color:#888" class="mono">${i.code || '—'}</div>
        </div>
        <div style="text-align:right;min-width:130px">
          <div class="qty mono">${i.qty} × ${fmt(i.unitRetail)}</div>
          <div style="font-size:11px;color:#888">原價 ${fmt(subRetail)}</div>
          <div style="font-weight:600" class="mono">${fmt(subCost)}</div>
        </div>
      </div>
    `;
  }).join('');

  const retail = orderRetail(o);
  const cost = orderAgentCost(o);

  document.getElementById('drawerBody').innerHTML = `
    <dl class="info-grid">
      <dt>客人</dt><dd>${o.customerName}</dd>
      <dt>電話</dt><dd>${o.customerPhone || '—'}</dd>
      <dt>地址</dt><dd>${o.address || '—'}</dd>
      <dt>付款</dt><dd>${o.payment}</dd>
      <dt>狀態</dt><dd><span class="status ${o.status}">${o.status}</span></dd>
    </dl>

    <div style="font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;margin:18px 0 8px;padding-bottom:6px;border-bottom:1px solid #eee">商品明細</div>
    ${itemsHTML}

    <div class="breakdown">
      <div class="row"><span class="label">原價總額（業績）</span><span class="mono">${fmt(retail)}</span></div>
      <div class="row"><span class="label">進貨折扣</span><span class="mono">${o.agentDiscount * 10}折</span></div>
      <div class="row final"><span>你要付給公司</span><span class="mono">${fmt(cost)}</span></div>
      <div class="row" style="margin-top:8px"><span class="label" style="color:#888">提示：你跟客人成交多少由你決定，差額即你的分潤</span><span></span></div>
    </div>
  `;

  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

init();
