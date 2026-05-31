const ADMIN_API = 'https://pola-shop-production.up.railway.app';
const ADMIN_TOKEN = 'pola-admin-2026';

const TIER_RULES = [
  { tier: 1, name: '新階',   minRetail: 0,       maxRetail: 70000,   discount: 0.80 },
  { tier: 2, name: '中階',   minRetail: 70000,   maxRetail: 140000,  discount: 0.75 },
  { tier: 3, name: '資深',   minRetail: 140000,  maxRetail: Infinity, discount: 0.70 },
];
const YOUR_COST_RATE = 0.60;

let ORDERS = [], AGENTS = [], CUSTOMERS = [];
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

async function loadData() {
  const [ordersRes, agentsRes, kpiRes, customersRes] = await Promise.all([
    apiFetch(`/api/admin/orders?month=${currentMonth}`),
    apiFetch(`/api/admin/agents?month=${currentMonth}`),
    apiFetch(`/api/admin/dashboard/kpi?month=${currentMonth}`),
    apiFetch(`/api/admin/customers`),
  ]);
  ORDERS = ordersRes.items;
  AGENTS = agentsRes;
  kpiData = kpiRes;
  CUSTOMERS = customersRes;
}

// ── Init ─────────────────────────────────────────────────────

async function init() {
  await loadData();

  const agentSel = document.getElementById('agentFilter');
  agentSel.innerHTML = '<option value="">全部業務</option>' +
    AGENTS.map(a => `<option value="${a.code}">${a.name} (${a.code})</option>`).join('');

  document.querySelectorAll('.sidenav button').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('searchInput').addEventListener('input', renderOrders);
  document.getElementById('statusFilter').addEventListener('change', renderOrders);
  document.getElementById('agentFilter').addEventListener('change', renderOrders);
  document.getElementById('agentSearch').addEventListener('input', renderAgents);

  renderKPIs();
  renderOrders();
  renderAgents();
  renderReport();
  renderCustomers();
  updatePendingBadge();
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.sidenav button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  ['orders', 'agents', 'report', 'products', 'customers'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== view);
  });
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
  footer.innerHTML = actions;

  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
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
  if (search) {
    list = list.filter(a =>
      a.name.toLowerCase().includes(search) ||
      a.code.toLowerCase().includes(search)
    );
  }

  tbody.innerHTML = list.map(a => {
    const s = a.monthly_stats || {};
    const calcTier = getTierByMonthlyRetail(s.retail_sum || 0);
    const next = getNextTier(calcTier.tier);
    const currentRule = TIER_RULES.find(t => t.tier === a.current_tier);
    const tierMin = calcTier.minRetail;
    const tierMax = next ? next.minRetail : tierMin * 1.5;
    const progress = Math.min(100, (((s.retail_sum || 0) - tierMin) / (tierMax - tierMin)) * 100);
    const remaining = next ? next.minRetail - (s.retail_sum || 0) : 0;
    const lockedBadge = a.manual_override ? `<span title="等級已鎖定" style="font-size:10px;color:#666;margin-left:4px">🔒</span>` : '';

    return `
    <tr>
      <td><strong>${a.name}</strong><br><span style="font-size:11px;color:#888">${a.phone || '—'}</span></td>
      <td class="mono">${a.code}</td>
      <td>
        <span class="tier T${a.current_tier}">T${a.current_tier}</span> ${currentRule.name}${lockedBadge}
        ${(calcTier.tier !== a.current_tier && !a.manual_override) ? `<br><span style="font-size:10px;color:#c97c14">⚠ 下月將調整至 T${calcTier.tier}</span>` : ''}
      </td>
      <td class="mono">${currentRule.discount * 10}折</td>
      <td style="min-width:200px">
        <div class="tier-bar"><div class="tier-bar-fill ${calcTier.tier === 2 ? 't2' : calcTier.tier === 3 ? 't3' : ''}" style="width:${progress}%"></div></div>
        <div class="tier-progress-text mono">${fmt(s.retail_sum || 0)}${next ? ` · 還差 ${fmt(remaining)} 升 T${next.tier}` : ' · 已達最高階'}</div>
      </td>
      <td class="num">${s.order_count || 0}</td>
      <td class="num mono">${fmt(s.agent_cost_sum || 0)}</td>
      <td class="num mono" style="color:#19884a">${fmt(s.your_profit_sum || 0)}</td>
      <td><button class="btn ghost sm" onclick="openEditAgentModal('${a.code}')">編輯</button></td>
    </tr>`;
  }).join('');
}

// ── New Agent Modal ───────────────────────────────────────────

function openNewAgentModal() {
  document.getElementById('newAgentModal').classList.add('open');
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
  if (!name || !code) { alert('請填寫姓名與業務代碼'); return; }
  try {
    await apiFetch('/api/admin/agents', {
      method: 'POST',
      body: JSON.stringify({ code, name, phone, current_tier: tier }),
    });
    await refreshAgents();
    closeNewAgentModal();
  } catch (e) {
    alert('新增失敗：' + e.message);
  }
}

// ── Edit Agent Modal ──────────────────────────────────────────

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
  if (!newName) { alert('姓名為必填'); return; }
  try {
    await apiFetch(`/api/admin/agents/${origCode}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName, phone: newPhone, current_tier: newTier, manual_override: newOverride, joined_at: newJoined }),
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
    ? `確定要刪除業務「${a.name}」？\n\n注意：該業務名下有 ${orderCount} 筆訂單。`
    : `確定要刪除業務「${a.name}」？`;
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
  sel.innerHTML = '<option value="">全部業務</option>' +
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

function renderCustomers() {
  const tbody = document.getElementById('customersTbody');
  if (!tbody) return;
  if (!CUSTOMERS.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-row">尚無客人資料，點「新增客人」開始建立</td></tr>`;
    return;
  }
  tbody.innerHTML = CUSTOMERS.map(c => `
    <tr>
      <td>${c.name}</td>
      <td class="mono">${c.phone}</td>
      <td>${c.agent_name || c.agent_code || '未指定'}</td>
      <td><button class="btn ghost sm" onclick="deleteCustomer('${c.phone}', '${c.name}')">刪除</button></td>
    </tr>
  `).join('');
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

async function cycleMonth() {
  const [year, mon] = currentMonth.split('-').map(Number);
  const d = new Date(year, mon - 2);
  currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('monthPill').textContent = `${d.getFullYear()} / ${d.getMonth() + 1}月 ▾`;
  await loadData();
  renderKPIs();
  renderOrders();
  renderAgents();
  renderReport();
  updatePendingBadge();
}

// ── Export CSV ────────────────────────────────────────────────

function exportCSV() {
  const headers = ['訂單號', '日期', '業務', '客人', '電話', '地址', '備註', '原價', '實收', '毛利', '狀態'];
  const rows = ORDERS.map(o => {
    const agent = AGENTS.find(a => a.code === o.agent_code);
    return [
      o.order_number, createdAtFmt(o.created_at), agent ? agent.name : (o.agent_code || ''),
      o.customer_name, o.customer_phone || '', o.customer_address || '', o.notes || '',
      o.retail_total, o.agent_cost_total, o.your_profit, o.status,
    ];
  });
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `POLA-訂單-${currentMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

init();
