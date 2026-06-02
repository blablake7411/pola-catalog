// ─────────────────────────────────────────────────────────────
// Agent dashboard logic
// ─────────────────────────────────────────────────────────────

function formatPhone(phone) {
  if (!phone) return phone;
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('09')) return d.slice(0,4) + '-' + d.slice(4,7) + '-' + d.slice(7);
  if (d.length === 10) return d.slice(0,2) + '-' + d.slice(2,6) + '-' + d.slice(6);
  return phone;
}

const SHOP_API_AGENT = 'https://pola-shop-production.up.railway.app';
const params = new URLSearchParams(window.location.search);
let currentAgentCode = params.get('agent') || 'A002';
let currentAgent = AGENTS.find(a => a.code === currentAgentCode) || AGENTS[1];
let usingBackend = false;
let agentOrders = [];  // full order data for drawer
let agentCode = '';

const now = new Date();
let currentAgentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

async function changeAgentMonth(val) {
  if (!val) return;
  currentAgentMonth = val;
  const code = params.get('agent');
  if (code) await tryRenderFromBackend(code);
}

async function init() {
  const sel = document.getElementById('agentSwitch');
  if (sel) sel.style.display = 'none';
  const mi = document.getElementById('agentMonthInput');
  if (mi) {
    const now2 = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = `${d.getFullYear()} / ${d.getMonth()+1}月`;
      if (val === currentAgentMonth) opt.selected = true;
      mi.appendChild(opt);
    }
  }

  const urlCode = params.get('agent');
  if (!urlCode) {
    showAgentError('請從管理後台點擊「後台」按鈕開啟此頁。');
    return;
  }

  const ok = await tryRenderFromBackend(urlCode);
  if (!ok) {
    showAgentError(`顧問代碼「${urlCode}」資料載入失敗，請稍後重試或確認代碼是否正確。`);
  }
}

function setEl(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el[prop] = val;
}
function setQS(sel, prop, val) {
  const el = document.querySelector(sel);
  if (el) el[prop] = val;
}

function showAgentError(msg) {
  setEl('agentName', 'textContent', '—');
  setEl('tierPill', 'innerHTML', '');
  setQS('.greeting', 'textContent', msg);
  ['wsRetail','wsOrders','wsPayable','payRetail','payDiscount','payTotal'].forEach(id => setEl(id, 'textContent', '—'));
  setEl('ladder', 'innerHTML', '');
  const fill = document.getElementById('progressFill');
  if (fill) fill.style.width = '0%';
  setEl('nextTarget', 'innerHTML', '');
  setEl('progressNow', 'textContent', '');
  setEl('progressMax', 'textContent', '');
  setEl('agentLink', 'textContent', '—');
  setEl('orderCountSub', 'textContent', '');
  setEl('ordersList', 'innerHTML', `<div class="empty" style="text-align:center;padding:24px;color:#aaa">${msg}<br><br><button onclick="location.reload()" style="background:#111;color:#fff;border:none;border-radius:8px;padding:8px 20px;cursor:pointer;font-family:inherit">重新整理</button></div>`);
}

async function tryRenderFromBackend(code) {
  try {
    const res = await fetch(`${SHOP_API_AGENT}/api/agents/${code}/stats?month=${currentAgentMonth}`);
    if (!res.ok) return false;
    const data = await res.json();
    const agent = data.agent;
    if (!agent) return false;

    usingBackend = true;
    const isStore = agent.agent_type === 'store';
    const rules = isStore ? STORE_TIER_RULES : TIER_RULES;
    const currentTier = agent.current_tier || 1;
    const currentRule = rules.find(t => t.tier === currentTier) || rules[0];

    const [mYear, mMon] = currentAgentMonth.split('-').map(Number);
    const monthLabel = `${mYear}年${mMon}月`;

    // ── Welcome card ──────────────────────────────────────────
    setEl('agentName', 'textContent', agent.name);
    const tierLabel = isStore
      ? `${currentRule.name} · ${currentRule.discount * 10}折進貨`
      : `T${currentTier} ${currentRule.name} · ${currentRule.discount * 10}折進貨`;
    setEl('tierPill', 'innerHTML', `<span style="opacity:.6">●</span> ${tierLabel}`);
    setQS('.greeting', 'textContent', `Hi！這是你在 POLA 的顧問後台 — ${monthLabel}`);

    const retailSum = data.monthly_retail || 0;
    const orderCount = data.monthly_order_count || 0;
    const payable = Math.round(retailSum * currentRule.discount);

    setEl('wsRetail', 'textContent', fmt(retailSum));
    setEl('wsOrders', 'textContent', orderCount);
    setEl('wsPayable', 'textContent', fmt(payable));

    // ── Tier ladder（用 current_tier，不用業績反推）─────────────
    const prefix = isStore ? 'S' : 'T';
    setEl('ladder', 'innerHTML', rules.map(t => {
      let cls = '';
      if (t.tier === currentTier) cls = 'active';
      else if (t.tier < currentTier) cls = 'passed';
      return `<div class="ladder-step ${cls}">
        <div class="lab">${prefix}${t.tier} · ${t.name}</div>
        <div class="range">${t.discount * 10}折 · ${formatRange(t)}</div>
      </div>`;
    }).join(''));

    // ── Progress（從 current_tier 的門檻往上算）──────────────────
    const nextTierObj = rules.find(t => t.tier === currentTier + 1) || null;
    const maintainThreshold = currentRule.minRetail;
    let progress = 0;

    if (!nextTierObj) {
      progress = maintainThreshold > 0 ? Math.min(100, (retailSum / maintainThreshold) * 100) : 100;
      setEl('progressMax', 'textContent', fmt(maintainThreshold));
      setEl('nextTarget', 'innerHTML', `<strong style="color:#19884a">已達最高階 · ${prefix}${currentTier} ${currentRule.name}</strong>`);
    } else if (retailSum >= maintainThreshold) {
      progress = Math.min(100, ((retailSum - maintainThreshold) / (nextTierObj.minRetail - maintainThreshold)) * 100);
      const gap = Math.max(0, nextTierObj.minRetail - retailSum);
      setEl('progressMax', 'textContent', fmt(nextTierObj.minRetail));
      setEl('nextTarget', 'innerHTML', `距離 <strong>${prefix}${nextTierObj.tier} ${nextTierObj.name}</strong> 還差 <strong class="mono">${fmt(gap)}</strong>`);
    } else {
      progress = maintainThreshold > 0 ? Math.min(100, (retailSum / maintainThreshold) * 100) : 0;
      setEl('progressMax', 'textContent', fmt(maintainThreshold));
      setEl('nextTarget', 'innerHTML', `需達 <strong>${fmt(maintainThreshold)}</strong> 維持 ${prefix}${currentTier}`);
    }

    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = progress + '%';
    setEl('progressNow', 'textContent', '↑ ' + fmt(retailSum));

    // ── Agent link → 只顯示代碼 ──────────────────────────────
    setEl('agentLink', 'textContent', code);

    // ── Payable ───────────────────────────────────────────────
    setEl('payRetail', 'textContent', fmt(retailSum));
    setEl('payDiscount', 'textContent', `${currentRule.discount * 10}折 (−${fmt(retailSum - payable)})`);
    setEl('payTotal', 'textContent', fmt(payable));

    // ── Orders：fetch full data from orders endpoint ──────────
    agentCode = code;
    try {
      const ordersRes = await fetch(`${SHOP_API_AGENT}/api/agents/${code}/orders?month=${currentAgentMonth}`);
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json();
        agentOrders = ordersData.items || [];
      }
    } catch (e) { agentOrders = []; }

    renderAgentOrders(currentRule);
    await loadGiftRequests(code, currentAgentMonth);
    return true;
  } catch (e) {
    console.error('[agent] tryRenderFromBackend error:', e);
    return false;
  }
}

function renderEverything() {
  const stats = agentMonthlyStats(currentAgent.code, ORDERS);
  const currentRule = TIER_RULES.find(t => t.tier === currentAgent.currentTier);
  const calcTier = getTierByMonthlyRetail(stats.retailSum);
  const next = getNextTier(calcTier.tier);

  // Welcome
  document.getElementById('agentName').textContent = currentAgent.name;
  const isStore = currentAgent.agentType === 'store';
  const tierLabel = isStore ? `${currentRule.name} · ${currentRule.discount * 10}折進貨` : `T${currentAgent.currentTier} ${currentRule.name} · ${currentRule.discount * 10}折進貨`;
  document.getElementById('tierPill').innerHTML =
    `<span style="opacity:.6">●</span> ${tierLabel}`;

  document.getElementById('wsRetail').textContent = fmt(stats.retailSum);
  document.getElementById('wsOrders').textContent = stats.orderCount;
  document.getElementById('wsPayable').textContent = fmt(stats.agentCostSum);

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
    const saving = Math.round((currentRule.discount - next.discount) * 10000);
    cta.innerHTML = '';
  } else {
    document.getElementById('nextTarget').innerHTML = `<strong style="color:#19884a">已達最高階</strong>`;
    cta.classList.add('maxed');
    cta.innerHTML = '';
  }

  // Mismatch warning for next month
  if (calcTier.tier !== currentAgent.currentTier) {
    const arrow = calcTier.tier > currentAgent.currentTier ? '↑' : '↓';
    cta.innerHTML += `<br><span style="font-size:12px;opacity:.85">依本月業績，下個月 1 號將自動調整至 <strong>T${calcTier.tier}</strong> ${arrow}</span>`;
  }

  // Agent link
  document.getElementById('agentLink').textContent = currentAgent.code;

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
  if (t.maxRetail === Infinity) return (t.minRetail / 10000) + ' 萬+';
  if (t.minRetail === 0) return '0 – ' + (t.maxRetail / 10000) + ' 萬';
  return (t.minRetail / 10000) + ' – ' + (t.maxRetail / 10000) + ' 萬';
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
          <span class="order-customer">${o.customerName} · ${formatPhone(o.customerPhone) || '無電話'}</span>
          <span class="order-items-sum">${itemsSum}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ── Orders render ─────────────────────────────────────────────

function renderAgentOrders(currentRule) {
  const count = agentOrders.filter(o => o.status !== '已取消').length;
  setEl('orderCountSub', 'textContent', `共 ${count} 筆`);
  const list = document.getElementById('ordersList');
  if (!agentOrders.length) {
    list.innerHTML = `<div class="empty">本月還沒有訂單，分享你的專屬連結給客人開始接單！</div>`;
    return;
  }
  const discount = currentRule ? currentRule.discount : 0.8;
  list.innerHTML = agentOrders.map(o => {
    const retail = o.retail_total || 0;
    const cost = o.agent_cost_total || Math.round(retail * discount);
    const itemsSum = o.items?.length > 0
      ? (o.items.length === 1 ? o.items[0].product_name : `${o.items[0].product_name} 等 ${o.items.length} 項`)
      : '—';
    return `
    <div class="order-card" onclick="openOrderDrawer('${o.order_number}')" style="cursor:pointer">
      <div class="order-row1">
        <div class="order-meta">
          <span class="num">${o.order_number}</span>
          <span class="date">${(o.created_at || '').slice(0, 16).replace('T', ' ')}</span>
          <span class="status ${o.status}">${o.status}</span>
        </div>
        <div class="order-amount">
          <div class="retail mono">原價 ${fmt(retail)}</div>
          <div class="agent-cost mono">${fmt(cost)}</div>
        </div>
      </div>
      <div class="order-row2">
        <span class="order-customer">${o.customer_name || '—'}${o.customer_phone ? ' · ' + formatPhone(o.customer_phone) : ''}</span>
        <span class="order-items-sum">${itemsSum}</span>
      </div>
    </div>`;
  }).join('');
}

// ── Order Drawer ──────────────────────────────────────────────

function openOrderDrawer(orderNumber) {
  const o = agentOrders.find(x => x.order_number === orderNumber);
  if (!o) return;

  const canEdit = o.status === '待確認';
  const itemsHTML = (o.items || []).map(i => `
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f5f5f5;font-size:13px">
      <div>
        ${i.product_code ? `<span style="color:#bbb;font-size:11px;margin-right:4px">${i.product_code}</span>` : ''}${i.product_name}
        ${i.variant_label ? `<span style="color:#aaa;font-size:11px"> ${i.variant_label}</span>` : ''}
        <div style="font-size:11px;color:#aaa">x${i.quantity} × NTD ${(i.unit_price||0).toLocaleString()}</div>
      </div>
      <div style="font-weight:600;min-width:80px;text-align:right">NTD ${((i.unit_price||0)*(i.quantity||1)).toLocaleString()}</div>
    </div>`).join('');

  const editSection = canEdit ? `
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid #eee">
      <div style="font-size:11px;color:#aaa;font-weight:600;letter-spacing:.05em;margin-bottom:10px">編輯收件資料 <span style="color:#f59e0b">（待確認可編輯）</span></div>
      <div style="display:grid;gap:8px">
        <input id="drawerEditName" type="text" value="${o.customer_name || ''}" placeholder="客人姓名"
          style="border:1px solid #ddd;border-radius:7px;padding:8px 10px;font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box">
        <input id="drawerEditPhone" type="text" value="${o.customer_phone || ''}" placeholder="電話"
          style="border:1px solid #ddd;border-radius:7px;padding:8px 10px;font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box">
        <input id="drawerEditAddress" type="text" value="${o.customer_address || ''}" placeholder="收件地址"
          style="border:1px solid #ddd;border-radius:7px;padding:8px 10px;font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box">
        <textarea id="drawerEditNotes" rows="2" placeholder="備註"
          style="border:1px solid #ddd;border-radius:7px;padding:8px 10px;font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box;resize:none">${o.notes || ''}</textarea>
        <button onclick="saveOrderEdit('${o.order_number}')"
          style="background:#111;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;width:100%">
          儲存修改
        </button>
      </div>
    </div>` : `<div style="margin-top:12px;font-size:11px;color:#aaa;text-align:center">訂單已確認，如需修改請聯繫管理人員</div>`;

  document.getElementById('drawerTitle').textContent = `訂單 ${o.order_number}`;
  document.getElementById('drawerSub').textContent = `${(o.created_at||'').slice(0,16).replace('T',' ')} · ${o.status}`;
  document.getElementById('drawerBody').innerHTML = `
    <dl class="info-grid">
      <dt>客人</dt><dd>${o.customer_name || '—'}</dd>
      <dt>電話</dt><dd>${formatPhone(o.customer_phone) || '—'}</dd>
      <dt>地址</dt><dd>${o.customer_address || '—'}</dd>
      <dt>備註</dt><dd>${o.notes || '—'}</dd>
    </dl>
    <div style="font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;margin:14px 0 8px;padding-bottom:5px;border-bottom:1px solid #eee">商品明細</div>
    ${itemsHTML}
    <div class="breakdown" style="margin-top:12px">
      <div class="row"><span class="label">原價總額</span><span class="mono">NTD ${(o.retail_total||0).toLocaleString()}</span></div>
      <div class="row final"><span>你應付公司</span><span class="mono">NTD ${(o.agent_cost_total||0).toLocaleString()}</span></div>
    </div>
    ${editSection}`;

  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}

async function saveOrderEdit(orderNumber) {
  const name = document.getElementById('drawerEditName')?.value.trim();
  const phone = document.getElementById('drawerEditPhone')?.value.trim();
  const address = document.getElementById('drawerEditAddress')?.value.trim();
  const notes = document.getElementById('drawerEditNotes')?.value.trim();

  if (!name) { alert('客人姓名不可空白'); return; }

  try {
    const res = await fetch(`${SHOP_API_AGENT}/api/agents/${agentCode}/orders/${orderNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: name, customer_phone: phone || null, customer_address: address || null, notes: notes || null }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.detail || '儲存失敗');
      return;
    }
    const updated = await res.json();
    const idx = agentOrders.findIndex(o => o.order_number === orderNumber);
    if (idx !== -1) agentOrders[idx] = updated;
    closeDrawer();
    renderAgentOrders(null);
  } catch (e) {
    alert('網路錯誤，請稍後再試');
  }
}

// ── Old Drawer (mock data, kept for compatibility) ─────────────
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
      <dt>電話</dt><dd>${formatPhone(o.customerPhone) || '—'}</dd>
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
      <div class="row" style="margin-top:8px"><span class="label" style="color:#888;font-size:12px">你跟客人成交多少由你決定，公司只收進貨折扣價</span><span></span></div>
    </div>
  `;

  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

// ── Gift Requests ─────────────────────────────────────────────

let giftItems = [];

function fmt2(n) { return 'NTD ' + Math.round(n || 0).toLocaleString(); }

async function loadGiftRequests(code, month) {
  try {
    const url = month
      ? `${SHOP_API_AGENT}/api/agents/${code}/gift-requests?month=${month}`
      : `${SHOP_API_AGENT}/api/agents/${code}/gift-requests`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    renderGiftStats(data.gift_total_sum || 0, data.request_count || 0);
    renderGiftList(data.items || []);
  } catch (e) {
    console.error('[gift] loadGiftRequests error:', e);
  }
}

function renderGiftStats(totalSum, count) {
  document.getElementById('giftStats').innerHTML = `
    <div class="gift-stat-card">
      <div class="label">本月兌換件數</div>
      <div class="value">${count} 件</div>
    </div>
    <div class="gift-stat-card">
      <div class="label">本月兌換總值</div>
      <div class="value mono">${fmt2(totalSum)}</div>
    </div>`;
}

function renderGiftList(items) {
  const el = document.getElementById('giftList');
  if (!items.length) {
    el.innerHTML = `<div style="font-size:13px;color:#aaa;text-align:center;padding:20px 0">本月還沒有贈品申請</div>`;
    return;
  }
  el.innerHTML = items.map(r => {
    const giftSummary = r.gift_items.map(i =>
      `${i.product_name}${i.quantity > 1 ? ' ×' + i.quantity : ''}`
    ).join('、');
    return `
    <div class="gift-card">
      <div class="gift-card-top">
        <div>
          <div class="gift-card-name">${r.customer_name}</div>
          <div class="gift-card-addr">${r.customer_address}</div>
        </div>
        <span class="gift-status ${r.status}">${r.status}</span>
      </div>
      <div class="gift-items-summary">${giftSummary}</div>
      <div class="gift-total-line">兌換總值 ${fmt2(r.gift_total)} · 消費原價 ${fmt2(r.eligible_amount)}</div>
      ${r.notes ? `<div style="font-size:11px;color:#aaa;margin-top:4px">備註：${r.notes}</div>` : ''}
    </div>`;
  }).join('');
}

function openGiftModal() {
  giftItems = [];
  document.getElementById('giftCustomerName').value = '';
  document.getElementById('giftCustomerAddress').value = '';
  document.getElementById('giftEligibleAmount').value = '';
  document.getElementById('giftNotes').value = '';
  renderGiftItemRows();
  addGiftItem();
  document.getElementById('giftDrawer').classList.add('open');
  document.getElementById('giftOverlay').classList.add('open');
}

function closeGiftModal() {
  document.getElementById('giftDrawer').classList.remove('open');
  document.getElementById('giftOverlay').classList.remove('open');
}

function addGiftItem() {
  giftItems.push({ product_code: '', product_name: '', unit_value: '', quantity: 1 });
  renderGiftItemRows();
}

function removeGiftItem(idx) {
  giftItems.splice(idx, 1);
  renderGiftItemRows();
}

function updateGiftItem(idx, field, value) {
  giftItems[idx][field] = field === 'unit_value' || field === 'quantity' ? Number(value) : value;
  updateGiftTotalLine();
}

function renderGiftItemRows() {
  document.getElementById('giftItemsContainer').innerHTML = giftItems.map((item, i) => `
    <div class="gift-item-row">
      <input type="text" placeholder="商品代碼" value="${item.product_code}" oninput="updateGiftItem(${i},'product_code',this.value)" style="width:90px">
      <input type="text" placeholder="贈品名稱" value="${item.product_name}" oninput="updateGiftItem(${i},'product_name',this.value)" style="flex:1">
      <input type="number" placeholder="單價" value="${item.unit_value || ''}" oninput="updateGiftItem(${i},'unit_value',this.value)" style="width:80px">
      <input type="number" min="1" value="${item.quantity}" oninput="updateGiftItem(${i},'quantity',this.value)" style="width:50px">
      <button class="gift-item-remove" onclick="removeGiftItem(${i})">×</button>
    </div>`).join('');
  updateGiftTotalLine();
}

function updateGiftTotalLine() {
  const total = giftItems.reduce((s, i) => s + (Number(i.unit_value) || 0) * (Number(i.quantity) || 1), 0);
  const eligible = Number(document.getElementById('giftEligibleAmount').value) || 0;
  const color = eligible > 0 && total > eligible ? '#e55' : '#444';
  document.getElementById('giftTotalLine').innerHTML =
    `贈品總值：<strong style="color:${color}">${fmt2(total)}</strong>` +
    (eligible > 0 ? ` / 上限 ${fmt2(eligible)}` : '');
}

async function submitGiftRequest() {
  const code = params.get('agent');
  if (!code) return;

  const customerName = document.getElementById('giftCustomerName').value.trim();
  const customerAddress = document.getElementById('giftCustomerAddress').value.trim();
  const eligibleAmount = Number(document.getElementById('giftEligibleAmount').value);
  const notes = document.getElementById('giftNotes').value.trim();

  if (!customerName || !customerAddress) { alert('請填寫客人姓名與收件地址'); return; }
  if (!eligibleAmount) { alert('請填寫客人消費原價總額'); return; }

  const validItems = giftItems.filter(i => i.product_name && i.unit_value > 0);
  if (!validItems.length) { alert('請至少加入一項贈品（需填寫名稱和單價）'); return; }

  const giftTotal = validItems.reduce((s, i) => s + i.unit_value * (i.quantity || 1), 0);
  if (giftTotal > eligibleAmount) { alert(`贈品總值 ${fmt2(giftTotal)} 超過消費上限 ${fmt2(eligibleAmount)}`); return; }

  try {
    const res = await fetch(`${SHOP_API_AGENT}/api/agents/${code}/gift-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: customerName,
        customer_address: customerAddress,
        eligible_amount: eligibleAmount,
        gift_items: validItems,
        notes: notes || null,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.detail || '送出失敗');
      return;
    }
    closeGiftModal();
    await loadGiftRequests(code, currentAgentMonth);
  } catch (e) {
    alert('網路錯誤，請稍後再試');
  }
}

init();
