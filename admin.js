const ADMIN_API = 'https://pola-shop-production.up.railway.app';
const ADMIN_TOKEN = 'pola-admin-2026';

const TIER_RULES = [
  { tier: 1, name: '新階', minRetail: 0,       maxRetail: 100000,  discount: 0.80 },
  { tier: 2, name: '中階', minRetail: 100000,  maxRetail: 200000,  discount: 0.75 },
  { tier: 3, name: '資深', minRetail: 200000,  maxRetail: Infinity, discount: 0.70 },
];
const STORE_TIER_RULES = [
  { tier: 1, name: '店家',     minRetail: 0,       maxRetail: 300000,  discount: 0.75 },
  { tier: 2, name: '店家高階', minRetail: 300000,  maxRetail: Infinity, discount: 0.70 },
];
const YOUR_COST_RATE = 0.60;

function formatPhone(phone) {
  if (!phone) return phone;
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('09')) return d.slice(0,4) + '-' + d.slice(4,7) + '-' + d.slice(7);
  if (d.length === 10) return d.slice(0,2) + '-' + d.slice(2,6) + '-' + d.slice(6);
  return phone;
}

let ORDERS = [], AGENTS = [], CUSTOMERS = [], GIFT_REQUESTS = [];
let editAllProducts = [];
let dateRangeStart = '', dateRangeEnd = '';
let kpiData = null;
let currentView = 'orders';
let selectedOrderId = null;
let currentMonth = new Date().toISOString().slice(0, 7);

// ── API helpers ───────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const res = await fetch(ADMIN_API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Data helpers ──────────────────────────────────────────────

function getTierByMonthlyRetail(retail) {
  return TIER_RULES.find(t => retail >= t.minRetail && retail < t.maxRetail) || TIER_RULES[0];
}
function getNextTier(tier) {
  return TIER_RULES.find(t => t.tier === tier + 1) || null;
}
function fmt(n) { return 'NTD ' + Math.round(n || 0).toLocaleString(); }

function createdAtFmt(iso) {
  if (!iso) return '';
  return iso.replace('T', ' ').slice(0, 16);
}

// ── Load data from API ────────────────────────────────────────

function ordersApiUrl() {
  if (dateRangeStart && dateRangeEnd) {
    return `/api/admin/orders?start_date=${dateRangeStart}&end_date=${dateRangeEnd}`;
  }
  return `/api/admin/orders?month=${currentMonth}`;
}

async function loadData() {
  const [ordersRes, agentsRes, kpiRes, customersRes] = await Promise.all([
    apiFetch(ordersApiUrl()),
    apiFetch(`/api/admin/agents?month=${currentMonth}`),
    apiFetch(`/api/admin/dashboard/kpi?month=${currentMonth}`),
    apiFetch(`/api/admin/customers`),
  ]);
  ORDERS = ordersRes.items;
  AGENTS = agentsRes;
  kpiData = kpiRes;
  CUSTOMERS = customersRes;
  updateMonthDisplay();
}

function updateMonthDisplay() {
  const el = document.getElementById('currentMonthLabel');
  if (!el) return;
  if (dateRangeStart && dateRangeEnd) {
    el.textContent = `${dateRangeStart} ～ ${dateRangeEnd}`;
    el.style.color = '#f59e0b';
  } else {
    const [y, m] = currentMonth.split('-');
    el.textContent = `${y} 年 ${parseInt(m)} 月`;
    el.style.color = '';
  }
}

// ── Init ─────────────────────────────────────────────────────

function buildMonthSelect(elId, selected) {
  const sel = document.getElementById(elId);
  if (!sel) return;
  sel.innerHTML = '';
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = `${d.getFullYear()} / ${d.getMonth()+1}月`;
    if (val === selected) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function init() {
  buildMonthSelect('monthInput', currentMonth);

  await loadData();

  const agentSel = document.getElementById('agentFilter');
  agentSel.innerHTML = '<option value="">全部顧問</option>' +
    AGENTS.map(a => `<option value="${a.code}">${a.name} (${a.code})</option>`).join('');

  document.querySelectorAll('.sidenav button').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('searchInput').addEventListener('input', renderOrders);
  document.getElementById('statusFilter').addEventListener('change', renderOrders);
  document.getElementById('agentFilter').addEventListener('change', renderOrders);
  document.getElementById('agentSearch').addEventListener('input', renderAgents);

  updateMonthDisplay();
  renderKPIs();
  renderOrders();
  renderAgents();
  renderReport();
  filteredCustomers = CUSTOMERS;
  populateCustomerAgentFilter();
  renderCustomers();
  updatePendingBadge();
  loadGifts();
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.sidenav button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  ['orders', 'agents', 'report', 'products', 'customers', 'settlement', 'gifts'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== view);
  });
  if (view === 'products') renderProductList();
  if (view === 'settlement') renderSettlement();
  if (view === 'gifts') loadGifts();
  if (view === 'customers') { filteredCustomers = CUSTOMERS; populateCustomerAgentFilter(); renderCustomers(); }
}

function updatePendingBadge() {
  const pending = ORDERS.filter(o => o.status === '待確認').length;
  const badge = document.getElementById('pendingBadge');
  badge.textContent = pending;
  badge.style.display = pending > 0 ? '' : 'none';
}

// ── KPI cards ────────────────────────────────────────────────

function renderKPIs() {
  if (!kpiData) return;
  document.getElementById('kpiOrderCount').textContent = kpiData.order_count;
  document.getElementById('kpiOrderSub').textContent = `含取消單 ${kpiData.cancelled_count} 筆`;
  document.getElementById('kpiRetail').textContent = fmt(kpiData.retail_total);
  document.getElementById('kpiAgentCost').textContent = fmt(kpiData.agent_cost_total);
  document.getElementById('kpiProfit').textContent = fmt(kpiData.your_profit);
}

// ── Orders Table ─────────────────────────────────────────────

function renderOrders() {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const statusF = document.getElementById('statusFilter').value;
  const agentF = document.getElementById('agentFilter').value;

  let list = ORDERS.slice();
  if (search) {
    list = list.filter(o =>
      o.order_number.toLowerCase().includes(search) ||
      o.customer_name.toLowerCase().includes(search) ||
      (o.customer_phone || '').includes(search)
    );
  }
  if (statusF) list = list.filter(o => o.status === statusF);
  if (agentF) list = list.filter(o => o.agent_code === agentF);

  const tbody = document.getElementById('ordersTbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">沒有符合條件的訂單</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(o => {
    const agent = AGENTS.find(a => a.code === o.agent_code);
    const tier = o.agent_tier || '—';
    return `
    <tr class="row-clickable" onclick="openDrawer('${o.order_number}')">
      <td class="mono" style="font-weight:600">${o.order_number}</td>
      <td style="color:#666;font-size:12px">${createdAtFmt(o.created_at)}</td>
      <td>${agent ? agent.name : (o.agent_code || '未指定')} ${o.agent_tier ? `<span class="tier T${tier}">T${tier}</span>` : ''}</td>
      <td>${o.customer_name}</td>
      <td class="num mono">${fmt(o.retail_total)}</td>
      <td class="num mono">${fmt(o.agent_cost_total)}</td>
      <td class="num mono" style="color:#19884a">${fmt(o.your_profit)}</td>
      <td><span class="status ${o.status}">${o.status}</span></td>
    </tr>`;
  }).join('');
}

// ── Order Drawer ─────────────────────────────────────────────

function openDrawer(orderNumber) {
  selectedOrderId = orderNumber;
  const o = ORDERS.find(x => x.order_number === orderNumber);
  if (!o) return;
  const agent = AGENTS.find(a => a.code === o.agent_code);

  document.getElementById('drawerTitle').textContent = `訂單 ${o.order_number}`;
  document.getElementById('drawerSub').textContent = createdAtFmt(o.created_at);

  const itemsHTML = o.items.map(i => {
    const subRetail = i.unit_price * i.quantity;
    const subCost = o.agent_discount ? Math.round(subRetail * o.agent_discount) : subRetail;
    return `
      <tr>
        <td style="font-size:12px"><span class="mono" style="color:#888">${i.product_code || '—'}</span><br>${i.product_name}${i.variant_label ? ` · ${i.variant_label}` : ''}</td>
        <td class="num">${i.quantity}</td>
        <td class="num mono">${fmt(i.unit_price)}</td>
        <td class="num mono">${fmt(subRetail)}</td>
        <td class="num mono" style="color:#666">${o.agent_discount ? fmt(subCost) : '—'}</td>
      </tr>`;
  }).join('');

  const discountLine = o.agent_discount
    ? `<div class="breakdown-row"><span class="label">業務折扣</span><span class="mono">${o.agent_discount * 10}折</span></div>
       <div class="breakdown-row total"><span>業務應付給你</span><span class="mono">${fmt(o.agent_cost_total)}</span></div>
       <div class="breakdown-row" style="margin-top:10px"><span class="label">你的進貨成本（6折）</span><span class="mono" style="color:#999">−${fmt(o.your_cost)}</span></div>
       <div class="breakdown-row total"><span>你的毛利</span><span class="profit mono">${fmt(o.your_profit)}</span></div>`
    : `<div class="breakdown-row" style="color:#aaa;font-size:12px"><span>尚未指定業務，金額待確認</span></div>`;

  document.getElementById('drawerBody').innerHTML = `
    <dl class="info-grid">
      <dt>業務</dt><dd>${agent ? agent.name : (o.agent_code || '未指定')} ${o.agent_tier ? `<span class="tier T${o.agent_tier}">T${o.agent_tier} · ${o.agent_discount * 10}折進貨</span>` : ''}</dd>
      <dt>客人</dt><dd>${o.customer_name}</dd>
      <dt>電話</dt><dd>${o.customer_phone || '—'}</dd>
      <dt>地址</dt><dd>${o.customer_address || '—'}</dd>
      <dt>付款</dt><dd>${o.payment_method || '待確認'}</dd>
      <dt>備註</dt><dd>${o.notes || '—'}</dd>
      <dt>狀態</dt><dd><span class="status ${o.status}">${o.status}</span></dd>
    </dl>
    <div class="section-title">商品明細</div>
    <table style="font-size:12px;width:100%">
      <thead><tr>
        <th style="font-size:10px">商品</th>
        <th class="num" style="font-size:10px">數量</th>
        <th class="num" style="font-size:10px">原價</th>
        <th class="num" style="font-size:10px">原價小計</th>
        <th class="num" style="font-size:10px">業務進貨</th>
      </tr></thead>
      <tbody>${itemsHTML}</tbody>
    </table>
    <div class="breakdown-card">
      <div class="breakdown-row"><span class="label">原價總額（業績計算）</span><span class="mono">${fmt(o.retail_total)}</span></div>
      ${o.discount_amount > 0 ? `<div class="breakdown-row"><span class="label">折扣</span><span class="mono" style="color:#e55">−${fmt(o.discount_amount)}</span></div>` : ''}
      ${o.shipping_fee > 0 ? `<div class="breakdown-row"><span class="label">運費</span><span class="mono">+${fmt(o.shipping_fee)}</span></div>` : ''}
      ${(o.discount_amount > 0 || o.shipping_fee > 0) ? `<div class="breakdown-row"><span class="label" style="font-weight:600">客人實付</span><span class="mono" style="font-weight:700">${fmt(o.final_amount)}</span></div>` : ''}
      ${discountLine}
    </div>`;

  const footer = document.getElementById('drawerFooter');
  let actions = '';
  if (o.status === '待確認') {
    actions = `
      <button class="btn ghost" style="flex:1" onclick="updateStatus('已取消')">取消訂單</button>
      <button class="btn" style="flex:2" onclick="updateStatus('已確認')">確認訂單</button>`;
  } else if (o.status === '已確認') {
    actions = `
      <button class="btn ghost" style="flex:1" onclick="updateStatus('待確認')">退回待確認</button>
      <button class="btn" style="flex:2" onclick="updateStatus('已出貨')">標記已出貨</button>`;
  } else if (o.status === '已出貨') {
    actions = `<button class="btn ghost" style="flex:1" onclick="updateStatus('已確認')">退回已確認</button>`;
  } else {
    actions = `<button class="btn ghost" style="flex:1" onclick="updateStatus('待確認')">復原訂單</button>`;
  }
  actions += `
    <button class="btn ghost" style="flex:1;margin-left:8px" onclick="openEditCustomerModal()">編輯資料</button>
    <button class="btn ghost" style="flex:1;margin-left:8px" onclick="printShippingSlip()">出貨單</button>
    <button class="btn ghost" style="flex:1;margin-left:8px;color:#dc2626;border-color:#fca5a5" onclick="deleteOrder()">刪除</button>`;
  footer.innerHTML = actions;

  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

async function deleteOrder() {
  if (!selectedOrderId) return;
  if (!confirm(`確定要永久刪除訂單 ${selectedOrderId}？\n此操作無法復原。`)) return;
  try {
    await apiFetch(`/api/admin/orders/${selectedOrderId}`, { method: 'DELETE' });
    closeDrawer();
    ORDERS = ORDERS.filter(o => o.order_number !== selectedOrderId);
    selectedOrderId = null;
    renderOrders();
    updatePendingBadge();
  } catch (e) {
    alert('刪除失敗：' + e.message);
  }
  selectedOrderId = null;
}

async function updateStatus(newStatus) {
  try {
    const updated = await apiFetch(`/api/admin/orders/${selectedOrderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    const idx = ORDERS.findIndex(o => o.order_number === selectedOrderId);
    if (idx !== -1) ORDERS[idx] = updated;
    kpiData = await apiFetch(`/api/admin/dashboard/kpi?month=${currentMonth}`);
    renderKPIs();
    renderOrders();
    renderAgents();
    renderReport();
    updatePendingBadge();
    openDrawer(selectedOrderId);
  } catch (e) {
    alert('更新失敗，請重試');
  }
}

// ── Agents Table ─────────────────────────────────────────────

function renderAgents() {
  const search = (document.getElementById('agentSearch')?.value || '').trim().toLowerCase();
  const tbody = document.getElementById('agentsTbody');

  let list = AGENTS.slice();
  list.sort((a, b) => a.code.localeCompare(b.code));
  if (search) {
    list = list.filter(a =>
      a.name.toLowerCase().includes(search) ||
      a.code.toLowerCase().includes(search)
    );
  }

  tbody.innerHTML = list.map(a => {
    const s = a.monthly_stats || {};
    const retail = s.retail_sum || 0;

    // ── 6折特殊顯示（agent_type = 'owner'）：等級空白，排最前 ──────
    const isOwner = a.agent_type === 'owner' || (a.discount_rate != null && a.discount_rate <= 0.60);
    if (isOwner) {
      return `<tr>
        <td><strong>${a.name}</strong><br><span style="font-size:11px;color:#888">${formatPhone(a.phone) || '—'}</span></td>
        <td class="mono">${a.code}</td>
        <td></td>
        <td class="mono">6折</td>
        <td style="font-size:12px;color:#aaa">—</td>
        <td class="num">${s.order_count || 0}</td>
        <td class="num mono">${fmt(s.agent_cost_sum || 0)}</td>
        <td class="num mono" style="color:#19884a">${fmt(s.your_profit_sum || 0)}</td>
        <td class="num mono" style="color:#d97706">${s.gift_total_sum > 0 ? fmt(s.gift_total_sum) : '—'}</td>
        <td style="white-space:nowrap">
          <button class="btn ghost sm" onclick="openEditAgentModal('${a.code}')">編輯</button>
          <button class="btn ghost sm" style="margin-top:4px" onclick="window.open('agent?agent=${a.code}','_blank')">後台</button>
        </td>
      </tr>`;
    }

    const currentRule = TIER_RULES.find(t => t.tier === a.current_tier) || TIER_RULES[0];
    const nextTier = getNextTier(a.current_tier);
    const calcTier = getTierByMonthlyRetail(retail);
    const lockedBadge = a.manual_override ? `<span title="等級已鎖定" style="font-size:10px;color:#666;margin-left:4px">🔒</span>` : '';

    // 進度條 & 文字
    let progress = 0, progressText = '';
    if (a.manual_override) {
      // 鎖定：只顯示本月業績，不顯示升級進度
      progress = 0;
      progressText = `${fmt(retail)} · 等級已鎖定`;
    } else if (!nextTier) {
      // 已是最高階：看是否達標維持
      const maintain = currentRule.minRetail;
      progress = maintain > 0 ? Math.min(100, (retail / maintain) * 100) : 100;
      progressText = retail >= maintain
        ? `${fmt(retail)} · 已達最高階`
        : `${fmt(retail)} · 需達 ${fmt(maintain)} 維持 T${a.current_tier}`;
    } else if (calcTier.tier >= a.current_tier) {
      // 本月業績已達當前階：顯示升級進度
      const gap = nextTier.minRetail - retail;
      progress = Math.min(100, ((retail - currentRule.minRetail) / (nextTier.minRetail - currentRule.minRetail)) * 100);
      progressText = `${fmt(retail)} · 還差 ${fmt(Math.max(0, gap))} 升 T${nextTier.tier}`;
    } else {
      // 本月業績低於當前階門檻：顯示維持進度
      const maintain = currentRule.minRetail;
      progress = maintain > 0 ? Math.min(100, (retail / maintain) * 100) : 0;
      progressText = `${fmt(retail)} · 需達 ${fmt(maintain)} 維持 T${a.current_tier}`;
    }

    const fillClass = a.current_tier === 2 ? 't2' : a.current_tier === 3 ? 't3' : '';
    // 只在實際有下月調整資料時才顯示警告，且說明 3 個月規則
    const backendNextTier = s.calculated_tier_next_month;
    const warnNext = !a.manual_override && backendNextTier != null
      ? backendNextTier < a.current_tier
      : false; // 沒有後端資料就不亂猜

    return `
    <tr>
      <td><strong>${a.name}</strong><br><span style="font-size:11px;color:#888">${formatPhone(a.phone) || '—'}</span></td>
      <td class="mono">${a.code}</td>
      <td>
        <span class="tier T${a.current_tier}">T${a.current_tier}</span> ${currentRule.name}${lockedBadge}
        ${warnNext ? `<br><span style="font-size:10px;color:#c97c14">⚠ 若連續 3 個月未達標則調整至 T${backendNextTier}</span>` : ''}
      </td>
      <td class="mono">${currentRule.discount * 10}折</td>
      <td style="min-width:200px">
        <div class="tier-bar"><div class="tier-bar-fill ${fillClass}" style="width:${progress}%"></div></div>
        <div class="tier-progress-text mono">${progressText}</div>
      </td>
      <td class="num">${s.order_count || 0}</td>
      <td class="num mono">${fmt(s.agent_cost_sum || 0)}</td>
      <td class="num mono" style="color:#19884a">${fmt(s.your_profit_sum || 0)}</td>
      <td class="num mono" style="color:#d97706">${s.gift_total_sum > 0 ? fmt(s.gift_total_sum) : '—'}</td>
      <td style="white-space:nowrap">
        <button class="btn ghost sm" onclick="openEditAgentModal('${a.code}')">編輯</button>
        <button class="btn ghost sm" style="margin-top:4px" onclick="window.open('agent?agent=${a.code}','_blank')">後台</button>
      </td>
    </tr>`;
  }).join('');
}

// ── New Agent Modal ───────────────────────────────────────────

function updateNewAgentTierOptions() {
  const type = document.getElementById('newAgentType').value;
  const sel = document.getElementById('newAgentTier');
  if (type === 'store') {
    sel.innerHTML = `
      <option value="1">S1 店家 — 7.5折進貨</option>
      <option value="2">S2 店家高階 — 7折進貨</option>`;
  } else {
    sel.innerHTML = `
      <option value="1">T1 新階 — 8折進貨</option>
      <option value="2">T2 中階 — 7.5折進貨</option>
      <option value="3">T3 資深 — 7折進貨</option>`;
  }
}

function openNewAgentModal() {
  document.getElementById('newAgentModal').classList.add('open');
  document.getElementById('newAgentType').value = 'personal';
  updateNewAgentTierOptions();
  const lastNum = AGENTS.map(a => parseInt(a.code.replace(/\D/g, ''))).filter(n => !isNaN(n));
  const next = lastNum.length ? Math.max(...lastNum) + 1 : 1;
  document.getElementById('newAgentCode').value = 'A' + String(next).padStart(3, '0');
}
function closeNewAgentModal() {
  document.getElementById('newAgentModal').classList.remove('open');
  ['newAgentName', 'newAgentPhone'].forEach(id => document.getElementById(id).value = '');
}
async function saveNewAgent() {
  const name = document.getElementById('newAgentName').value.trim();
  const code = document.getElementById('newAgentCode').value.trim();
  const phone = document.getElementById('newAgentPhone').value.trim();
  const tier = parseInt(document.getElementById('newAgentTier').value);
  const agentType = document.getElementById('newAgentType').value;
  if (!name || !code) { alert('請填寫姓名與顧問代碼'); return; }
  // T2/T3 起始自動鎖定，避免一加入就觸發降級警告
  const autoLock = tier >= 2;
  try {
    await apiFetch('/api/admin/agents', {
      method: 'POST',
      body: JSON.stringify({ code, name, phone, current_tier: tier, agent_type: agentType, manual_override: autoLock }),
    });
    await refreshAgents();
    closeNewAgentModal();
  } catch (e) {
    alert('新增失敗：' + e.message);
  }
}

// ── Edit Agent Modal ──────────────────────────────────────────

function toggleEditTierField() {
  const type = document.getElementById('editAgentType')?.value;
  const field = document.getElementById('editAgentTierField');
  if (field) field.style.display = (type === 'owner') ? 'none' : '';
}

function openEditAgentModal(code) {
  const a = AGENTS.find(x => x.code === code);
  if (!a) return;
  document.getElementById('editAgentOriginalCode').value = a.code;
  document.getElementById('editAgentName').value = a.name;
  document.getElementById('editAgentCode').value = a.code;
  document.getElementById('editAgentPhone').value = a.phone || '';
  document.getElementById('editAgentTier').value = String(a.current_tier);
  document.getElementById('editAgentManualOverride').checked = !!a.manual_override;
  document.getElementById('editAgentJoined').value = a.joined_at || '';
  const typeEl = document.getElementById('editAgentType');
  if (typeEl) {
    typeEl.value = a.agent_type === 'owner' ? 'owner' : (a.agent_type === 'store' ? 'store' : 'personal');
    toggleEditTierField();
  }
  document.getElementById('editAgentModal').classList.add('open');
}
function closeEditAgentModal() {
  document.getElementById('editAgentModal').classList.remove('open');
}
async function saveEditAgent() {
  const origCode = document.getElementById('editAgentOriginalCode').value;
  const newName = document.getElementById('editAgentName').value.trim();
  const newPhone = document.getElementById('editAgentPhone').value.trim();
  const newTier = parseInt(document.getElementById('editAgentTier').value);
  const newOverride = document.getElementById('editAgentManualOverride').checked;
  const newJoined = document.getElementById('editAgentJoined').value;
  const newType = document.getElementById('editAgentType')?.value || 'personal';
  if (!newName) { alert('姓名為必填'); return; }
  const body = { name: newName, phone: newPhone, manual_override: newOverride, joined_at: newJoined, agent_type: newType };
  if (newType !== 'owner') body.current_tier = newTier;
  try {
    await apiFetch(`/api/admin/agents/${origCode}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    await refreshAgents();
    closeEditAgentModal();
  } catch (e) {
    alert('更新失敗：' + e.message);
  }
}
async function deleteAgent() {
  const origCode = document.getElementById('editAgentOriginalCode').value;
  const a = AGENTS.find(x => x.code === origCode);
  if (!a) return;
  const orderCount = ORDERS.filter(o => o.agent_code === origCode).length;
  const msg = orderCount > 0
    ? `確定要刪除顧問「${a.name}」？\n\n注意：該顧問名下有 ${orderCount} 筆訂單。`
    : `確定要刪除顧問「${a.name}」？`;
  if (!confirm(msg)) return;
  try {
    await apiFetch(`/api/admin/agents/${origCode}`, { method: 'DELETE' });
    await refreshAgents();
    closeEditAgentModal();
  } catch (e) {
    alert('刪除失敗：' + e.message);
  }
}

async function refreshAgents() {
  AGENTS = await apiFetch(`/api/admin/agents?month=${currentMonth}`);
  const sel = document.getElementById('agentFilter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">全部顧問</option>' +
    AGENTS.map(a => `<option value="${a.code}">${a.name} (${a.code})</option>`).join('');
  sel.value = cur;
  renderAgents();
  renderOrders();
  renderReport();
}

// ── Monthly Report ────────────────────────────────────────────

function renderReport() {
  if (!kpiData) return;
  document.getElementById('rRetail').textContent = fmt(kpiData.retail_total);
  document.getElementById('rAgentCost').textContent = fmt(kpiData.agent_cost_total);
  document.getElementById('rYourCost').textContent = fmt(kpiData.your_cost_total);
  document.getElementById('rProfit').textContent = fmt(kpiData.your_profit);

  const agentSums = AGENTS.map(a => ({
    agent: a,
    retail: a.monthly_stats?.retail_sum || 0,
  })).sort((a, b) => b.retail - a.retail);
  const maxRetail = Math.max(...agentSums.map(x => x.retail), 1);

  document.getElementById('agentRanking').innerHTML = agentSums.map(x => `
    <div class="bar-row">
      <div class="nm">${x.agent.name} <span class="tier T${x.agent.current_tier}" style="font-size:9px;padding:1px 5px">T${x.agent.current_tier}</span></div>
      <div class="bar"><div class="bar-fill" style="width:${(x.retail / maxRetail) * 100}%"></div></div>
      <div class="amt mono">${fmt(x.retail)}</div>
    </div>
  `).join('') || '<div style="color:#aaa;padding:10px">尚無資料</div>';

  const seriesMap = {};
  ORDERS.filter(o => o.status !== '已取消').forEach(o => {
    o.items.forEach(i => {
      const series = inferSeries(i.product_name);
      seriesMap[series] = (seriesMap[series] || 0) + i.unit_price * i.quantity;
    });
  });
  const seriesSorted = Object.entries(seriesMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxSeries = Math.max(...seriesSorted.map(x => x[1]), 1);
  document.getElementById('seriesRanking').innerHTML = seriesSorted.map(([s, v]) => `
    <div class="bar-row">
      <div class="nm" style="font-size:12px">${s}</div>
      <div class="bar"><div class="bar-fill" style="width:${(v / maxSeries) * 100}%"></div></div>
      <div class="amt mono">${fmt(v)}</div>
    </div>
  `).join('') || '<div style="color:#aaa;padding:10px">尚無資料</div>';
}

function inferSeries(name) {
  if (!name) return '其他';
  if (name.startsWith('B.A 極光')) return 'B.A grandluxe';
  if (name.startsWith('B.A 新生奇蹟') || name.includes('賦活霜')) return 'B.A 新生奇蹟';
  if (name.startsWith('B.A ')) return 'B.A';
  if (name.startsWith('Red B.A')) return 'Red B.A';
  if (name.startsWith('WRINKLE')) return 'WRINKLE SHOT';
  if (name.startsWith('WHITE SHOT')) return 'WHITE SHOT';
  if (name.startsWith('ALLU')) return 'ALLU 奧麗';
  if (name.startsWith('WHITISSIMO')) return 'WHITISSIMO';
  if (name.startsWith('MOISTISSIMO')) return 'MOISTISSIMO';
  if (name.startsWith('GROWING')) return 'GROWING SHOT';
  if (name.startsWith('FORM')) return 'FORM';
  if (name.startsWith('PENSÉE')) return 'PENSÉE';
  if (name.startsWith('SPARKLING')) return 'SPARKLING';
  return '其他';
}

// ── Customers ─────────────────────────────────────────────────

let filteredCustomers = [];

function renderCustomerStats() {
  const total = CUSTOMERS.length;
  const registered = CUSTOMERS.filter(c => c.has_account).length;
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('custStatTotal', total);
  el('custStatRegistered', registered);
  el('custStatUnregistered', total - registered);
}

function filterCustomers() {
  const q = (document.getElementById('customerSearch')?.value || '').toLowerCase();
  const agentF = document.getElementById('customerAgentFilter')?.value || '';
  const accountF = document.getElementById('customerAccountFilter')?.value || '';
  filteredCustomers = CUSTOMERS.filter(c => {
    if (q && !c.name.toLowerCase().includes(q) && !(c.phone || '').includes(q)) return false;
    if (agentF && c.agent_code !== agentF) return false;
    if (accountF === '1' && !c.has_account) return false;
    if (accountF === '0' && c.has_account) return false;
    return true;
  });
  renderCustomers();
}

function renderCustomers() {
  renderCustomerStats();
  const tbody = document.getElementById('customersTbody');
  if (!tbody) return;
  if (!filteredCustomers.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">尚無客人資料</td></tr>`;
    return;
  }
  tbody.innerHTML = filteredCustomers.map(c => `
    <tr>
      <td>${c.name}</td>
      <td class="mono">${formatPhone(c.phone)}</td>
      <td>${c.agent_name ? `${c.agent_name}<span style="color:#aaa;font-size:11px;margin-left:4px">(${c.agent_code})</span>` : '<span style="color:#ccc">未指定</span>'}</td>
      <td style="color:#888;font-size:12px">${c.notes || ''}</td>
      <td>${c.has_account
        ? '<span class="status 已出貨" style="background:#e7f7ec;color:#19884a">已註冊</span>'
        : '<span style="color:#bbb;font-size:12px">未註冊</span>'
      }</td>
      <td><button class="btn ghost sm" onclick="deleteCustomer('${c.phone}', '${c.name}')">刪除</button></td>
    </tr>
  `).join('');
}

function populateCustomerAgentFilter() {
  const sel = document.getElementById('customerAgentFilter');
  if (!sel) return;
  sel.innerHTML = '<option value="">全部顧問</option>' +
    AGENTS.map(a => `<option value="${a.code}">${a.name} (${a.code})</option>`).join('');
}

function openNewCustomerModal() {
  document.getElementById('newCustomerModal').classList.add('open');
  document.getElementById('newCustomerAgentSel').innerHTML =
    '<option value="">（未指定）</option>' +
    AGENTS.map(a => `<option value="${a.code}">${a.name} (${a.code})</option>`).join('');
}
function closeNewCustomerModal() {
  document.getElementById('newCustomerModal').classList.remove('open');
  ['newCustomerName', 'newCustomerPhone'].forEach(id => document.getElementById(id).value = '');
}
async function saveNewCustomer() {
  const name = document.getElementById('newCustomerName').value.trim();
  const phone = document.getElementById('newCustomerPhone').value.trim();
  const agentCode = document.getElementById('newCustomerAgentSel').value;
  if (!name || !phone) { alert('請填寫姓名與電話'); return; }
  try {
    await apiFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name, phone, agent_code: agentCode || null }),
    });
    CUSTOMERS = await apiFetch('/api/admin/customers');
    renderCustomers();
    closeNewCustomerModal();
  } catch (e) {
    alert('新增失敗：電話可能已存在');
  }
}
async function deleteCustomer(phone, name) {
  if (!confirm(`確定刪除客人「${name}」？`)) return;
  try {
    await apiFetch(`/api/admin/customers/${encodeURIComponent(phone)}`, { method: 'DELETE' });
    CUSTOMERS = await apiFetch('/api/admin/customers');
    renderCustomers();
  } catch (e) {
    alert('刪除失敗');
  }
}

// ── Month switcher ────────────────────────────────────────────

async function changeMonth(val) {
  if (!val) return;
  currentMonth = val;
  dateRangeStart = '';
  dateRangeEnd = '';
  const s = document.getElementById('dateStart');
  const e = document.getElementById('dateEnd');
  if (s) s.value = '';
  if (e) e.value = '';
  await loadData();
  renderKPIs();
  renderOrders();
  renderAgents();
  renderReport();
  renderSettlement();
  updatePendingBadge();
}

async function applyDateRange() {
  const s = document.getElementById('dateStart')?.value;
  const e = document.getElementById('dateEnd')?.value;
  if (!s || !e) { alert('請選擇開始和結束日期'); return; }
  if (s > e) { alert('開始日期不可晚於結束日期'); return; }
  dateRangeStart = s;
  dateRangeEnd = e;
  currentMonth = s.slice(0, 7);
  await loadData();
  renderKPIs();
  renderOrders();
  updatePendingBadge();
}

function clearDateRange() {
  dateRangeStart = '';
  dateRangeEnd = '';
  const s = document.getElementById('dateStart');
  const e = document.getElementById('dateEnd');
  if (s) s.value = '';
  if (e) e.value = '';
  updateMonthDisplay();
  loadData().then(() => { renderKPIs(); renderOrders(); updatePendingBadge(); });
}

// ── PDF 列印通用函式 ──────────────────────────────────────────

function openPrintWindow(title, bodyHTML) {
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="zh-TW"><head>
<meta charset="UTF-8"><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,'Noto Sans TC',sans-serif;font-size:12px;color:#111;padding:28px 32px}
h1{font-size:20px;font-weight:700;margin-bottom:4px}
.sub{font-size:11px;color:#888;margin-bottom:20px}
.brand{font-size:22px;font-weight:900;letter-spacing:4px;margin-bottom:2px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.stat{border:1px solid #eee;border-radius:6px;padding:12px 14px}
.stat .lbl{font-size:9px;color:#888;letter-spacing:1px;text-transform:uppercase}
.stat .val{font-size:18px;font-weight:700;margin-top:4px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:8px 10px;font-size:9px;color:#888;letter-spacing:1px;text-transform:uppercase;border-bottom:2px solid #111}
td{padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:11px}
.num{text-align:right}
.footer{margin-top:24px;font-size:10px;color:#bbb;text-align:center}
.print-btn{display:inline-block;margin-top:20px;background:#111;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit}
@media print{.no-print{display:none!important}.print-btn{display:none}}
</style></head><body>
<div class="brand">POLA</div>
<h1>${title}</h1>
<div class="sub">列印日期：${new Date().toLocaleDateString('zh-TW')} &nbsp;·&nbsp; 月份：${currentMonth}</div>
${bodyHTML}
<div class="footer">© 2026 POLA 台灣 · 所有金額單位 NTD</div>
<div class="no-print" style="text-align:center">
  <button class="print-btn" onclick="window.print()">列印 / 儲存 PDF</button>
</div>
</body></html>`);
  w.document.close();
}

// ── 訂單匯出 PDF ─────────────────────────────────────────────

function exportOrdersPDF() {
  const list = ORDERS.slice();
  const retailTotal = list.filter(o=>o.status!=='已取消').reduce((s,o)=>s+(o.retail_total||0),0);
  const agentTotal = list.filter(o=>o.status!=='已取消').reduce((s,o)=>s+(o.agent_cost_total||0),0);
  const profitTotal = list.filter(o=>o.status!=='已取消').reduce((s,o)=>s+(o.your_profit||0),0);

  const statsHTML = `<div class="stats">
    <div class="stat"><div class="lbl">本月訂單</div><div class="val">${list.length}</div></div>
    <div class="stat"><div class="lbl">原價總額</div><div class="val">${fmt(retailTotal)}</div></div>
    <div class="stat"><div class="lbl">顧問實付</div><div class="val">${fmt(agentTotal)}</div></div>
    <div class="stat"><div class="lbl">你的毛利</div><div class="val">${fmt(profitTotal)}</div></div>
  </div>`;

  const rows = list.map(o => {
    const agent = AGENTS.find(a => a.code === o.agent_code);
    return `<tr>
      <td>${o.order_number}</td>
      <td>${createdAtFmt(o.created_at)}</td>
      <td>${agent ? agent.name : (o.agent_code || '未指定')}</td>
      <td>${o.customer_name}</td>
      <td>${formatPhone(o.customer_phone)||'—'}</td>
      <td class="num">${fmt(o.retail_total)}</td>
      <td class="num">${fmt(o.agent_cost_total)}</td>
      <td class="num" style="color:#19884a">${fmt(o.your_profit)}</td>
      <td>${o.status}</td>
    </tr>`;
  }).join('');

  const tableHTML = `<table>
    <thead><tr><th>訂單號</th><th>日期</th><th>顧問</th><th>客人</th><th>電話</th><th class="num">原價</th><th class="num">實收</th><th class="num">毛利</th><th>狀態</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  openPrintWindow(`訂單報表 — ${currentMonth}`, statsHTML + tableHTML);
}

// ── Print Shipping Slip ───────────────────────────────────────

function printShippingSlip() {
  const o = ORDERS.find(x => x.order_number === selectedOrderId);
  if (!o) return;
  const agent = AGENTS.find(a => a.code === o.agent_code);
  const itemsRows = o.items.map(i => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${i.product_code || ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${i.product_name}${i.variant_label ? ' · ' + i.variant_label : ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${i.quantity}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">NTD ${i.unit_price.toLocaleString()}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">NTD ${(i.unit_price * i.quantity).toLocaleString()}</td>
    </tr>`).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="zh-TW"><head>
  <meta charset="UTF-8">
  <title>POLA 出貨單 ${o.order_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, 'Noto Sans TC', sans-serif; font-size: 13px; color: #111; padding: 32px; max-width: 720px; margin: 0 auto; }
    .brand { font-size: 22px; font-weight: 900; letter-spacing: 4px; margin-bottom: 4px; }
    .sub { font-size: 11px; color: #888; letter-spacing: 2px; margin-bottom: 24px; }
    h2 { font-size: 14px; font-weight: 700; margin: 20px 0 8px; border-bottom: 1px solid #eee; padding-bottom: 6px; letter-spacing: 1px; text-transform: uppercase; color: #888; }
    .info-grid { display: grid; grid-template-columns: 100px 1fr; gap: 6px 12px; font-size: 13px; }
    .info-grid dt { color: #888; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    thead th { text-align: left; padding: 6px 8px; font-size: 11px; color: #888; border-bottom: 2px solid #111; letter-spacing: 1px; text-transform: uppercase; }
    thead th:last-child, thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
    .total-row { font-weight: 700; font-size: 14px; padding: 10px 8px 0; display: flex; justify-content: space-between; border-top: 2px solid #111; margin-top: 8px; }
    .notice { background: #f8f8f8; border-left: 3px solid #111; padding: 12px 16px; margin-top: 24px; font-size: 12px; line-height: 1.8; color: #555; }
    .footer { margin-top: 32px; font-size: 11px; color: #bbb; text-align: center; }
    @media print {
      body { padding: 16px; }
      button { display: none; }
    }
  </style>
  </head><body>
  <div class="brand">POLA</div>
  <div class="sub">出貨單 SHIPPING SLIP</div>

  <h2>訂單資訊</h2>
  <dl class="info-grid">
    <dt>訂單編號</dt><dd>${o.order_number}</dd>
    <dt>建立時間</dt><dd>${createdAtFmt(o.created_at)}</dd>
    <dt>狀態</dt><dd>${o.status}</dd>
    ${agent ? `<dt>業務</dt><dd>${agent.name} (${agent.code})</dd>` : ''}
  </dl>

  <h2>收件人</h2>
  <dl class="info-grid">
    <dt>姓名</dt><dd>${o.customer_name}</dd>
    <dt>電話</dt><dd>${formatPhone(o.customer_phone) || '—'}</dd>
    <dt>地址</dt><dd>${o.customer_address || '—'}</dd>
    ${o.notes ? `<dt>備註</dt><dd>${o.notes}</dd>` : ''}
  </dl>

  <h2>商品明細</h2>
  <table>
    <thead><tr>
      <th>商品碼</th><th>商品名稱</th><th style="text-align:right">數量</th><th style="text-align:right">單價</th><th style="text-align:right">小計</th>
    </tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>
  <div class="total-row">
    <span>原價總額</span>
    <span>NTD ${o.retail_total.toLocaleString()}</span>
  </div>

  <div class="notice">
    <strong>出貨說明</strong><br>
    出貨時間為週一至週五，中午 12:00 前確認付款可當天出貨；12:00 後確認則次一工作日出貨。<br>
    例假日及國定假日不出貨，請稍待次一工作日。
  </div>

  <div class="footer">© 2026 POLA 台灣 · 所有商品均為官方正品</div>

  <div style="margin-top:24px;text-align:center">
    <button onclick="window.print()" style="background:#111;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit">列印 / 儲存 PDF</button>
  </div>
  </body></html>`);
  win.document.close();
}

// ── Edit Order Modal ──────────────────────────────────────────

let editItems = [];

function openEditCustomerModal() {
  const o = ORDERS.find(x => x.order_number === selectedOrderId);
  if (!o) return;

  document.getElementById('editCustOrderNum').value = o.order_number;
  document.getElementById('editCustName').value = o.customer_name || '';
  document.getElementById('editCustPhone').value = o.customer_phone || '';
  document.getElementById('editCustAddress').value = o.customer_address || '';
  document.getElementById('editCustNotes').value = o.notes || '';
  document.getElementById('editCustPayment').value = o.payment_method || '';
  const dateEl = document.getElementById('editOrderDate');
  if (dateEl) dateEl.value = (o.created_at || '').slice(0, 10);

  const agentSel = document.getElementById('editCustAgent');
  agentSel.innerHTML = '<option value="">未指定</option>';
  (AGENTS || []).forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.code;
    opt.textContent = `${a.name} (${a.code})`;
    if (a.code === o.agent_code) opt.selected = true;
    agentSel.appendChild(opt);
  });

  loadAdminProducts();
  editAllProducts = [];
  adminProducts.forEach(p => {
    const price = parseInt((p.price || '').replace(/[^0-9]/g, '')) || 0;
    const base = { name: p.name, price, series: p.series || '' };
    if (p.variants && p.variants.length > 0) {
      p.variants.forEach(v => {
        editAllProducts.push({
          ...base,
          code: v.code || p.code || '',
          variant_label: v.label || '',
          display: `${p.name}｜${v.label}`,
          searchText: `${p.name} ${v.label} ${v.code || ''} ${p.code || ''}`.toLowerCase(),
        });
      });
    } else {
      editAllProducts.push({
        ...base,
        code: p.code || '',
        variant_label: '',
        display: p.name,
        searchText: `${p.name} ${p.code || ''}`.toLowerCase(),
      });
    }
  });
  const searchEl = document.getElementById('editProductSearch');
  if (searchEl) searchEl.value = '';
  fillEditProductSelect('');

  const discountEl = document.getElementById('editDiscount');
  const shippingEl = document.getElementById('editShipping');
  if (discountEl) discountEl.value = o.discount_amount || '';
  if (shippingEl) shippingEl.value = o.shipping_fee || '';

  editItems = (o.items || []).map(i => ({ ...i }));
  renderEditItems();

  document.getElementById('editCustomerModal').classList.add('open');
}

function closeEditCustomerModal() {
  document.getElementById('editCustomerModal').classList.remove('open');
}

function fillEditProductSelect(query) {
  const q = query.toLowerCase().trim();
  const filtered = q
    ? editAllProducts.filter(p => p.searchText.includes(q))
    : editAllProducts;
  const prodSel = document.getElementById('editNewProduct');
  prodSel.innerHTML = '<option value="">選擇商品…</option>' +
    filtered.map((p, i) =>
      `<option value="${i}"
        data-name="${p.name.replace(/"/g,'&quot;')}"
        data-price="${p.price}"
        data-series="${p.series.replace(/"/g,'&quot;')}"
        data-code="${p.code.replace(/"/g,'&quot;')}"
        data-variant="${(p.variant_label||'').replace(/"/g,'&quot;')}"
        >${p.code ? `[${p.code}] ` : ''}${p.display} — NTD ${p.price.toLocaleString()}</option>`
    ).join('');
}

function filterEditProducts(query) {
  fillEditProductSelect(query);
}

function renderEditItems() {
  const container = document.getElementById('editOrderItems');
  if (!editItems.length) {
    container.innerHTML = '<div style="color:#aaa;font-size:12px;padding:6px 0">（尚無商品）</div>';
    updateEditTotal();
    return;
  }
  container.innerHTML = editItems.map((item, idx) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f2f2f2">
      <div style="flex:1;font-size:13px;line-height:1.4">
        ${item.product_code ? `<span style="color:#bbb;font-size:11px;margin-right:3px">${item.product_code}</span>` : ''}${item.product_name}
      </div>
      <input type="number" value="${item.quantity}" min="1"
        style="width:52px;border:1px solid #ddd;border-radius:5px;padding:5px 6px;font-size:13px;text-align:center;font-family:inherit;outline:none"
        onchange="updateEditItemQty(${idx}, this.value)">
      <div style="min-width:80px;text-align:right;font-size:12px;color:#555">NTD ${(item.unit_price || 0).toLocaleString()}</div>
      <button onclick="removeEditItem(${idx})"
        style="background:none;border:none;cursor:pointer;color:#c00;font-size:18px;line-height:1;padding:0 2px">×</button>
    </div>
  `).join('');
  updateEditTotal();
}

function updateEditItemQty(idx, val) {
  editItems[idx].quantity = Math.max(1, parseInt(val) || 1);
  updateEditTotal();
}

function removeEditItem(idx) {
  editItems.splice(idx, 1);
  renderEditItems();
}

function addEditItem() {
  const sel = document.getElementById('editNewProduct');
  const opt = sel.selectedOptions[0];
  if (!opt || opt.value === '') return;
  const qty = Math.max(1, parseInt(document.getElementById('editNewQty').value) || 1);
  editItems.push({
    product_code: opt.dataset.code || null,
    product_name: opt.dataset.name,
    product_series: opt.dataset.series || null,
    variant_label: opt.dataset.variant || null,
    unit_price: parseInt(opt.dataset.price) || 0,
    quantity: qty,
  });
  sel.value = '';
  document.getElementById('editNewQty').value = 1;
  renderEditItems();
}

function updateEditTotal() {
  const subtotal = editItems.reduce((s, i) => s + (i.unit_price || 0) * (i.quantity || 1), 0);
  const discount = parseInt(document.getElementById('editDiscount')?.value) || 0;
  const shipping = parseInt(document.getElementById('editShipping')?.value) || 0;
  const final = subtotal - discount + shipping;
  const el = document.getElementById('editOrderTotal');
  if (!subtotal && !discount && !shipping) { el.textContent = ''; return; }
  el.innerHTML =
    `<div style="display:flex;justify-content:space-between;color:#888"><span>原價小計</span><span class="mono">NTD ${subtotal.toLocaleString()}</span></div>` +
    (discount ? `<div style="display:flex;justify-content:space-between;color:#e55"><span>折扣</span><span class="mono">−NTD ${discount.toLocaleString()}</span></div>` : '') +
    (shipping ? `<div style="display:flex;justify-content:space-between;color:#888"><span>運費</span><span class="mono">+NTD ${shipping.toLocaleString()}</span></div>` : '') +
    `<div style="display:flex;justify-content:space-between;font-weight:700;color:#111;border-top:1px solid #eee;margin-top:6px;padding-top:6px"><span>客人實付</span><span class="mono">NTD ${final.toLocaleString()}</span></div>`;
}

async function saveEditCustomer() {
  const orderNum = document.getElementById('editCustOrderNum').value;
  if (!editItems.length) {
    alert('請至少加入一項商品');
    return;
  }
  const body = {
    customer_name: document.getElementById('editCustName').value.trim(),
    customer_phone: document.getElementById('editCustPhone').value.trim(),
    customer_address: document.getElementById('editCustAddress').value.trim(),
    notes: document.getElementById('editCustNotes').value.trim(),
    payment_method: document.getElementById('editCustPayment').value.trim(),
    agent_code: document.getElementById('editCustAgent').value || null,
    order_date: document.getElementById('editOrderDate')?.value || null,
    discount_amount: parseInt(document.getElementById('editDiscount')?.value) || 0,
    shipping_fee: parseInt(document.getElementById('editShipping')?.value) || 0,
    items: editItems.map(i => ({
      product_code: i.product_code || null,
      product_name: i.product_name,
      product_series: i.product_series || null,
      unit_price: i.unit_price,
      quantity: i.quantity,
    })),
  };
  try {
    const updated = await apiFetch(`/api/admin/orders/${orderNum}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    const idx = ORDERS.findIndex(o => o.order_number === orderNum);
    if (idx !== -1) ORDERS[idx] = updated;
    closeEditCustomerModal();
    openDrawer(orderNum);
    renderOrders();
  } catch (e) {
    alert('儲存失敗：' + e.message);
  }
}

// ── Settlement (月結交點) ──────────────────────────────────────

const OWNER_COST_RATE = 0.60;

function renderSettlement() {
  const validOrders = ORDERS.filter(o => o.status !== '已取消');
  const retailTotal = validOrders.reduce((s, o) => s + (o.retail_total || 0), 0);
  const agentCostTotal = validOrders.reduce((s, o) => s + (o.agent_cost_total || 0), 0);
  const ownerCost = Math.round(retailTotal * OWNER_COST_RATE);
  const profit = agentCostTotal - ownerCost;

  document.getElementById('stlOrderCount').textContent = validOrders.length;
  document.getElementById('stlOrderSub').textContent = `含取消單 ${ORDERS.length - validOrders.length} 筆`;
  document.getElementById('stlRetail').textContent = fmt(retailTotal);
  document.getElementById('stlCost').textContent = fmt(ownerCost);
  document.getElementById('stlProfit').textContent = fmt(profit);

  // Settlement status
  const settledKey = `pola_settled_${currentMonth}`;
  const settled = JSON.parse(localStorage.getItem(settledKey) || 'null');
  const statusLabel = document.getElementById('stlStatusLabel');
  const settledAt = document.getElementById('stlSettledAt');
  const settleBtn = document.getElementById('stlSettleBtn');
  if (settled) {
    statusLabel.textContent = '已結款';
    statusLabel.style.color = '#19884a';
    settledAt.textContent = `${settled.date} 確認`;
    settleBtn.textContent = '取消結款';
    settleBtn.className = 'btn ghost';
    settleBtn.style.fontSize = '12px';
    settleBtn.style.padding = '7px 16px';
    settleBtn.onclick = () => unmarkSettled();
  } else {
    statusLabel.textContent = '未結款';
    statusLabel.style.color = '#c97c14';
    settledAt.textContent = '';
    settleBtn.textContent = `確認本月已結款（付廠商 ${fmt(ownerCost)}）`;
    settleBtn.className = 'btn';
    settleBtn.style.fontSize = '12px';
    settleBtn.style.padding = '7px 16px';
    settleBtn.onclick = () => markSettled();
  }

  // Agent breakdown
  const agentMap = {};
  validOrders.forEach(o => {
    const agent = AGENTS.find(a => a.code === o.agent_code);
    const key = o.agent_code || '__none__';
    const name = agent ? agent.name : (o.agent_code ? o.agent_code : '（直接下單／未指定）');
    if (!agentMap[key]) agentMap[key] = { name, retail: 0, agentCost: 0, ownerCost: 0, count: 0 };
    agentMap[key].retail += (o.retail_total || 0);
    agentMap[key].agentCost += (o.agent_cost_total || 0);
    agentMap[key].ownerCost += Math.round((o.retail_total || 0) * OWNER_COST_RATE);
    agentMap[key].count++;
  });

  const breakdown = document.getElementById('stlAgentBreakdown');
  breakdown.innerHTML = Object.values(agentMap).sort((a, b) => b.retail - a.retail).map(row => `
    <div style="display:grid;grid-template-columns:1fr auto auto auto auto;gap:16px;align-items:center;padding:10px 16px;border-bottom:1px solid #f5f5f5;font-size:13px">
      <div style="font-weight:600">${row.name} <span style="color:#aaa;font-weight:400;font-size:11px">${row.count} 筆</span></div>
      <div class="mono" style="text-align:right;color:#888">${fmt(row.retail)}<br><span style="font-size:10px">原價</span></div>
      <div class="mono" style="text-align:right">${fmt(row.agentCost)}<br><span style="font-size:10px;color:#aaa">顧問付你</span></div>
      <div class="mono" style="text-align:right;color:#c97c14">${fmt(row.ownerCost)}<br><span style="font-size:10px;color:#aaa">你付廠商</span></div>
      <div class="mono" style="text-align:right;color:#19884a">${fmt(row.agentCost - row.ownerCost)}<br><span style="font-size:10px;color:#aaa">毛利</span></div>
    </div>
  `).join('') || '<div style="padding:16px;color:#aaa;text-align:center">本月無訂單</div>';

  // Orders table
  const tbody = document.getElementById('stlOrdersTbody');
  if (!validOrders.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">本月無訂單</td></tr>`;
    return;
  }
  tbody.innerHTML = validOrders.map(o => {
    const agent = AGENTS.find(a => a.code === o.agent_code);
    const agentName = agent ? agent.name : (o.agent_code || '直接下單');
    const ownerCostRow = Math.round((o.retail_total || 0) * OWNER_COST_RATE);
    return `<tr class="row-clickable" onclick="openDrawer('${o.order_number}')">
      <td class="mono" style="font-weight:600">${o.order_number}</td>
      <td style="color:#666;font-size:12px">${createdAtFmt(o.created_at)}</td>
      <td>${agentName}</td>
      <td>${o.customer_name}</td>
      <td class="num mono">${fmt(o.retail_total)}</td>
      <td class="num mono">${o.agent_discount ? (o.agent_discount * 10) + '折' : '—'}</td>
      <td class="num mono" style="color:#c97c14">${fmt(ownerCostRow)}</td>
      <td><span class="status ${o.status}">${o.status}</span></td>
    </tr>`;
  }).join('');
}

function markSettled() {
  const key = `pola_settled_${currentMonth}`;
  localStorage.setItem(key, JSON.stringify({ date: new Date().toLocaleDateString('zh-TW') }));
  renderSettlement();
}
function unmarkSettled() {
  if (!confirm('確定取消本月結款記錄？')) return;
  localStorage.removeItem(`pola_settled_${currentMonth}`);
  renderSettlement();
}

function exportSettlementPDF() {
  const validOrders = ORDERS.filter(o => o.status !== '已取消');
  const retailTotal = validOrders.reduce((s,o)=>s+(o.retail_total||0),0);
  const agentCostTotal = validOrders.reduce((s,o)=>s+(o.agent_cost_total||0),0);
  const ownerCost = Math.round(retailTotal * OWNER_COST_RATE);
  const profit = agentCostTotal - ownerCost;

  const settled = JSON.parse(localStorage.getItem(`pola_settled_${currentMonth}`) || 'null');

  const statsHTML = `<div class="stats">
    <div class="stat"><div class="lbl">訂單筆數</div><div class="val">${validOrders.length}</div></div>
    <div class="stat"><div class="lbl">客人原價總額</div><div class="val">${fmt(retailTotal)}</div></div>
    <div class="stat"><div class="lbl">你應付廠商（6折）</div><div class="val">${fmt(ownerCost)}</div></div>
    <div class="stat"><div class="lbl">你的毛利</div><div class="val">${fmt(profit)}</div></div>
  </div>
  <p style="font-size:11px;margin-bottom:14px;color:${settled ? '#19884a' : '#c97c14'}">
    結款狀態：${settled ? `已結款（${settled.date}）` : '未結款'}
  </p>`;

  const rows = validOrders.map(o => {
    const agent = AGENTS.find(a => a.code === o.agent_code);
    const agentName = agent ? agent.name : (o.agent_code || '直接下單');
    const ownerCostRow = Math.round((o.retail_total||0)*OWNER_COST_RATE);
    return `<tr>
      <td>${o.order_number}</td>
      <td>${createdAtFmt(o.created_at)}</td>
      <td>${agentName}</td>
      <td>${o.customer_name}</td>
      <td class="num">${fmt(o.retail_total)}</td>
      <td class="num">${o.agent_discount ? o.agent_discount*10+'折' : '—'}</td>
      <td class="num" style="color:#c97c14">${fmt(ownerCostRow)}</td>
      <td class="num" style="color:#19884a">${fmt((o.agent_cost_total||0)-ownerCostRow)}</td>
      <td>${o.status}</td>
    </tr>`;
  }).join('');

  const tableHTML = `<table>
    <thead><tr><th>訂單號</th><th>日期</th><th>顧問</th><th>客人</th><th class="num">原價</th><th class="num">折扣</th><th class="num">付廠商</th><th class="num">毛利</th><th>狀態</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  openPrintWindow(`月結交點 — ${currentMonth}`, statsHTML + tableHTML);
}

// ── Product Management ────────────────────────────────────────

let adminProducts = [];
let editingProductName = null;
let editingVariants = [];

function loadAdminProducts() {
  const overrides = JSON.parse(localStorage.getItem('pola_product_overrides') || '{}');
  const newProds = JSON.parse(localStorage.getItem('pola_new_products') || '[]');
  const base = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []);

  adminProducts = base
    .map(p => overrides[p.name] ? { ...p, ...overrides[p.name] } : { ...p })
    .filter(p => !p._deleted);

  adminProducts = [...adminProducts, ...newProds.filter(p => !p._deleted)];
}

function renderProductList() {
  loadAdminProducts();
  const search = (document.getElementById('prodSearch')?.value || '').toLowerCase();
  const cat = document.getElementById('prodCatFilter')?.value || '';

  let list = adminProducts.filter(p => {
    if (cat && p.mainCategory !== cat) return false;
    if (search && !p.name.toLowerCase().includes(search) && !(p.code || '').toLowerCase().includes(search)) return false;
    return true;
  });

  const countEl = document.getElementById('prodCount');
  if (countEl) countEl.textContent = `共 ${list.length} 件`;

  const grid = document.getElementById('prodGrid');
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<div style="color:#aaa;padding:40px;text-align:center;grid-column:1/-1">沒有符合條件的商品</div>`;
    return;
  }

  grid.innerHTML = list.map(p => {
    const isNew = !(typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).some(x => x.name === p.name);
    const hasOverride = !isNew && JSON.parse(localStorage.getItem('pola_product_overrides') || '{}')[p.name];
    const pname = p.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `
    <div class="prod-card" onclick="openEditProductModal('${pname}')">
      <div class="prod-card-img">
        ${p.img
          ? `<img src="${p.img}" onerror="this.style.display='none'">`
          : `<div class="no-img">無圖片</div>`}
        ${isNew ? `<span style="position:absolute;top:6px;left:6px;background:#19884a;color:#fff;font-size:9px;padding:2px 6px;border-radius:4px">NEW</span>` : ''}
        ${hasOverride ? `<span style="position:absolute;top:6px;left:6px;background:#d4a017;color:#fff;font-size:9px;padding:2px 6px;border-radius:4px">已編輯</span>` : ''}
      </div>
      <div class="prod-card-info">
        <div class="prod-series-label">${p.series || ''}</div>
        <div class="prod-card-name">${p.name}</div>
        <div class="prod-card-price">${p.price || '—'}</div>
        ${p.code ? `<div class="prod-card-code">${p.code}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openNewProductModal() {
  editingProductName = null;
  document.getElementById('productModalTitle').textContent = '新增商品';
  document.getElementById('prodDeleteBtn').style.display = 'none';
  document.getElementById('prodEditOrigName').value = '';
  ['prodName','prodCode','prodPrice','prodSeries','prodSize','prodType','prodImgUrl','prodUrl','prodRefill','prodTagline','prodDesc','prodUsage','prodFootnotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.value = '';
  });
  document.getElementById('prodMainCat').value = '臉部保養';
  editingVariants = [];
  document.getElementById('prodVariantType').value = 'color';
  renderVariantRows();
  previewProdImg('');
  document.getElementById('productModal').classList.add('open');
}

function openEditProductModal(name) {
  const p = adminProducts.find(x => x.name === name);
  if (!p) return;
  editingProductName = name;
  document.getElementById('productModalTitle').textContent = '編輯商品';
  document.getElementById('prodDeleteBtn').style.display = '';
  document.getElementById('prodEditOrigName').value = name;

  document.getElementById('prodName').value = p.name || '';
  document.getElementById('prodCode').value = p.code || '';
  document.getElementById('prodPrice').value = p.price || '';
  document.getElementById('prodMainCat').value = p.mainCategory || '臉部保養';
  document.getElementById('prodSeries').value = p.series || '';
  document.getElementById('prodSize').value = p.size || '';
  document.getElementById('prodType').value = p.type || '';
  document.getElementById('prodImgUrl').value = p.img || '';
  document.getElementById('prodUrl').value = p.url || '';
  document.getElementById('prodRefill').value = p.refill || '';
  document.getElementById('prodTagline').value = p.tagline || '';
  document.getElementById('prodDesc').value = p.description || '';
  document.getElementById('prodUsage').value = p.usage || '';
  document.getElementById('prodFootnotes').value = (p.footnotes || []).join('\n');

  // Load variants
  editingVariants = (p.variants || []).map(v => ({ ...v }));
  const hasPrice = editingVariants.some(v => v.price);
  document.getElementById('prodVariantType').value = hasPrice ? 'size' : 'color';
  renderVariantRows();

  previewProdImg(p.img || '');
  document.getElementById('productModal').classList.add('open');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('open');
  editingProductName = null;
}

function addVariantRow() {
  editingVariants.push({ label: '', code: '', price: '', img: '' });
  renderVariantRows();
}

function removeVariantRow(idx) {
  editingVariants.splice(idx, 1);
  renderVariantRows();
}

function updateVariantField(idx, field, value) {
  editingVariants[idx][field] = value;
}

function renderVariantRows() {
  const container = document.getElementById('prodVariantsContainer');
  if (!container) return;
  const isSize = document.getElementById('prodVariantType')?.value === 'size';

  if (!editingVariants.length) {
    container.innerHTML = `<div style="font-size:12px;color:#bbb;padding:8px 0">尚無型號，點「+ 新增型號」加入</div>`;
    return;
  }

  container.innerHTML = editingVariants.map((v, i) => {
    const imgSrc = v.img || '';
    const hasImg = !!imgSrc;
    return `
    <div style="background:#fafafa;border:1px solid #eee;border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="display:grid;grid-template-columns:1fr 90px${isSize ? ' 100px' : ''};gap:6px;margin-bottom:8px">
        <input type="text" value="${(v.label||'').replace(/"/g,'&quot;')}" placeholder="型號名稱（例：01 玫紅）"
          oninput="updateVariantField(${i},'label',this.value)"
          style="border:1px solid #ddd;border-radius:6px;padding:6px 9px;font-size:12px;font-family:inherit;outline:none">
        <input type="text" value="${(v.code||'').replace(/"/g,'&quot;')}" placeholder="序號"
          oninput="updateVariantField(${i},'code',this.value)"
          style="border:1px solid #ddd;border-radius:6px;padding:6px 9px;font-size:12px;font-family:inherit;outline:none">
        ${isSize ? `<input type="text" value="${(v.price||'').replace(/"/g,'&quot;')}" placeholder="NTD 550"
          oninput="updateVariantField(${i},'price',this.value)"
          style="border:1px solid #ddd;border-radius:6px;padding:6px 9px;font-size:12px;font-family:inherit;outline:none">` : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${hasImg ? `<img src="${imgSrc}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #eee;flex-shrink:0" onerror="this.style.display='none'">` : `<div style="width:40px;height:40px;background:#f0f0f0;border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#bbb">無圖</div>`}
        <input type="text" value="${imgSrc.startsWith('data:') ? '' : imgSrc.replace(/"/g,'&quot;')}"
          placeholder="貼上圖片 URL"
          oninput="updateVariantField(${i},'img',this.value);renderVariantRows()"
          style="flex:1;border:1px solid #ddd;border-radius:6px;padding:6px 9px;font-size:11px;font-family:inherit;outline:none"
          ${imgSrc.startsWith('data:') ? 'title="已上傳本機圖片"' : ''}>
        <label style="cursor:pointer;white-space:nowrap">
          <input type="file" accept="image/*" style="display:none" onchange="uploadVariantImg(${i},this)">
          <span style="font-size:11px;border:1px solid #ddd;border-radius:6px;padding:5px 10px;background:#fff;cursor:pointer;white-space:nowrap">本機上傳</span>
        </label>
        <button onclick="removeVariantRow(${i})" style="background:none;border:none;color:#ccc;font-size:20px;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0" title="移除">×</button>
      </div>
    </div>`;
  }).join('');
}

function uploadVariantImg(idx, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    editingVariants[idx].img = e.target.result;
    renderVariantRows();
  };
  reader.readAsDataURL(file);
}

function previewProdImg(url) {
  const preview = document.getElementById('prodImgPreview');
  if (!preview) return;
  preview.innerHTML = url
    ? `<img src="${url}" onerror="this.style.display='none'">`
    : `<span style="font-size:10px;color:#ccc">預覽</span>`;
}

function handleProdImgUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('prodImgUrl').value = e.target.result;
    previewProdImg(e.target.result);
  };
  reader.readAsDataURL(file);
}

function saveProduct() {
  const name = document.getElementById('prodName').value.trim();
  if (!name) { alert('請填寫商品名稱'); return; }

  const footnotesRaw = document.getElementById('prodFootnotes').value.trim();
  const data = {
    name,
    mainCategory: document.getElementById('prodMainCat').value,
    series: document.getElementById('prodSeries').value.trim() || '其他',
    code: document.getElementById('prodCode').value.trim() || undefined,
    price: document.getElementById('prodPrice').value.trim() || undefined,
    size: document.getElementById('prodSize').value.trim() || undefined,
    type: document.getElementById('prodType').value.trim() || undefined,
    img: document.getElementById('prodImgUrl').value.trim() || undefined,
    url: document.getElementById('prodUrl').value.trim() || undefined,
    refill: document.getElementById('prodRefill').value.trim() || undefined,
    tagline: document.getElementById('prodTagline').value.trim() || undefined,
    description: document.getElementById('prodDesc').value.trim() || undefined,
    usage: document.getElementById('prodUsage').value.trim() || undefined,
    footnotes: footnotesRaw ? footnotesRaw.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
  };

  // Variants: only keep rows with a label
  const validVariants = editingVariants
    .filter(v => v.label && v.label.trim())
    .map(v => {
      const row = { label: v.label.trim() };
      if (v.code && v.code.trim()) row.code = v.code.trim();
      if (v.price && v.price.trim()) row.price = v.price.trim();
      if (v.img && v.img.trim()) row.img = v.img.trim();
      return row;
    });
  if (validVariants.length > 0) data.variants = validVariants;

  Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

  const origName = editingProductName;
  const base = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []);
  const isOriginal = base.some(p => p.name === origName);

  if (origName) {
    if (isOriginal) {
      const overrides = JSON.parse(localStorage.getItem('pola_product_overrides') || '{}');
      overrides[origName] = data;
      localStorage.setItem('pola_product_overrides', JSON.stringify(overrides));
    } else {
      const newProds = JSON.parse(localStorage.getItem('pola_new_products') || '[]');
      const idx = newProds.findIndex(p => p.name === origName);
      if (idx !== -1) newProds[idx] = data;
      localStorage.setItem('pola_new_products', JSON.stringify(newProds));
    }
  } else {
    const newProds = JSON.parse(localStorage.getItem('pola_new_products') || '[]');
    newProds.push(data);
    localStorage.setItem('pola_new_products', JSON.stringify(newProds));
  }

  closeProductModal();
  renderProductList();
  syncCatalogToBackend();
}

function deleteProduct() {
  if (!editingProductName) return;
  const name = editingProductName;
  if (!confirm(`確定刪除商品「${name}」？`)) return;

  const base = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []);
  const isOriginal = base.some(p => p.name === name);

  if (isOriginal) {
    const overrides = JSON.parse(localStorage.getItem('pola_product_overrides') || '{}');
    overrides[name] = { ...(overrides[name] || {}), _deleted: true };
    localStorage.setItem('pola_product_overrides', JSON.stringify(overrides));
  } else {
    const newProds = JSON.parse(localStorage.getItem('pola_new_products') || '[]');
    localStorage.setItem('pola_new_products', JSON.stringify(newProds.filter(p => p.name !== name)));
  }

  closeProductModal();
  renderProductList();
  syncCatalogToBackend();
}

async function syncCatalogToBackend() {
  loadAdminProducts();
  try {
    await apiFetch('/api/admin/settings/products', {
      method: 'POST',
      body: JSON.stringify(adminProducts),
    });
  } catch (e) {
    console.warn('[sync] 目錄同步失敗:', e.message);
  }
}

// ── Gift Requests ─────────────────────────────────────────────

async function loadGifts() {
  const statusFilter = document.getElementById('giftStatusFilter')?.value || '';
  let url = `/api/admin/gift-requests?month=${currentMonth}`;
  if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;
  try {
    const data = await apiFetch(url);
    GIFT_REQUESTS = data.items || [];
    renderGiftStats(data);
    renderGiftTable(GIFT_REQUESTS);
    updateGiftBadge();
  } catch (e) {
    console.error('[gifts] loadGifts error:', e);
  }
}

function renderGiftStats(data) {
  const pending = (data.items || []).filter(r => r.status === '待處理').length;
  const el = id => document.getElementById(id);
  if (el('giftStatCount')) el('giftStatCount').textContent = data.request_count ?? '—';
  if (el('giftStatTotal')) el('giftStatTotal').textContent = fmt(data.gift_total_sum);
  if (el('giftStatPending')) el('giftStatPending').textContent = pending;
}

function renderGiftTable(items) {
  const tbody = document.getElementById('giftsTbody');
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#aaa;padding:24px">本月沒有贈品申請</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(r => {
    const giftSummary = r.gift_items.map(i =>
      `${i.product_code ? `<span style="color:#aaa;font-size:10px">${i.product_code}</span> ` : ''}${i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`
    ).join('<br>');
    const dateStr = r.created_at ? r.created_at.slice(0, 16).replace('T', ' ') : '—';
    const statusClass = { '待處理': 'amber', '已完成': 'green', '已取消': 'gray' }[r.status] || 'gray';
    const statusColor = { '待處理': '#d97706', '已完成': '#16a34a', '已取消': '#94a3b8' }[r.status] || '#888';
    return `<tr>
      <td style="font-size:11px;color:#888">${dateStr}</td>
      <td>${r.agent_name || r.agent_code}</td>
      <td><strong>${r.customer_name}</strong></td>
      <td style="font-size:12px;color:#666;max-width:140px">${r.customer_address}</td>
      <td style="font-size:12px;line-height:1.6">${giftSummary}</td>
      <td class="num mono">${fmt(r.eligible_amount)}</td>
      <td class="num mono">${fmt(r.gift_total)}</td>
      <td><span style="font-size:11px;font-weight:600;color:${statusColor}">${r.status}</span></td>
      <td>
        <select onchange="updateGiftStatus(${r.id}, this.value)" style="font-size:11px;border:1px solid #ddd;border-radius:6px;padding:4px 7px;font-family:inherit;outline:none;background:#fff">
          <option value="待處理" ${r.status === '待處理' ? 'selected' : ''}>待處理</option>
          <option value="已完成" ${r.status === '已完成' ? 'selected' : ''}>已完成</option>
          <option value="已取消" ${r.status === '已取消' ? 'selected' : ''}>已取消</option>
        </select>
      </td>
    </tr>`;
  }).join('');
}

async function updateGiftStatus(id, status) {
  try {
    await apiFetch(`/api/admin/gift-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadGifts();
  } catch (e) {
    alert('更新失敗');
  }
}

function updateGiftBadge() {
  const pending = GIFT_REQUESTS.filter(r => r.status === '待處理').length;
  const badge = document.getElementById('giftBadge');
  if (badge) {
    badge.textContent = pending;
    badge.style.display = pending > 0 ? '' : 'none';
  }
}

init();
