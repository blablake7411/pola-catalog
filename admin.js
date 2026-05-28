// ─────────────────────────────────────────────────────────────
// Admin dashboard logic
// ─────────────────────────────────────────────────────────────

let currentView = 'orders';
let selectedOrderId = null;

// ── Init ─────────────────────────────────────────────────────
function init() {
  // populate agent filter
  const agentSel = document.getElementById('agentFilter');
  AGENTS.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.code;
    opt.textContent = `${a.name} (${a.code})`;
    agentSel.appendChild(opt);
  });

  // sidenav clicks
  document.querySelectorAll('.sidenav button').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // filters
  document.getElementById('searchInput').addEventListener('input', renderOrders);
  document.getElementById('statusFilter').addEventListener('change', renderOrders);
  document.getElementById('agentFilter').addEventListener('change', renderOrders);
  document.getElementById('agentSearch').addEventListener('input', renderAgents);

  // initial render
  renderKPIs();
  renderOrders();
  renderAgents();
  renderReport();
  updatePendingBadge();
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.sidenav button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  ['orders', 'agents', 'report', 'products'].forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('hidden', v !== view);
  });
}

function updatePendingBadge() {
  const pending = ORDERS.filter(o => o.status === '待確認').length;
  const badge = document.getElementById('pendingBadge');
  if (pending > 0) {
    badge.textContent = pending;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// ── KPI cards ────────────────────────────────────────────────
function renderKPIs() {
  const valid = ORDERS.filter(o => o.status !== '已取消');
  const cancelled = ORDERS.filter(o => o.status === '已取消').length;

  const retail = valid.reduce((s, o) => s + orderRetail(o), 0);
  const agentCost = valid.reduce((s, o) => s + orderAgentCost(o), 0);
  const profit = valid.reduce((s, o) => s + orderYourProfit(o), 0);

  document.getElementById('kpiOrderCount').textContent = valid.length;
  document.getElementById('kpiOrderSub').textContent = `含取消單 ${cancelled} 筆`;
  document.getElementById('kpiRetail').textContent = fmt(retail);
  document.getElementById('kpiAgentCost').textContent = fmt(agentCost);
  document.getElementById('kpiProfit').textContent = fmt(profit);
}

// ── Orders Table ─────────────────────────────────────────────
function renderOrders() {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const statusF = document.getElementById('statusFilter').value;
  const agentF = document.getElementById('agentFilter').value;

  let list = ORDERS.slice();
  if (search) {
    list = list.filter(o =>
      o.orderNumber.toLowerCase().includes(search) ||
      o.customerName.toLowerCase().includes(search) ||
      (o.customerPhone || '').includes(search)
    );
  }
  if (statusF) list = list.filter(o => o.status === statusF);
  if (agentF) list = list.filter(o => o.agentCode === agentF);

  const tbody = document.getElementById('ordersTbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">沒有符合條件的訂單</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(o => {
    const agent = AGENTS.find(a => a.code === o.agentCode);
    return `
    <tr class="row-clickable" onclick="openDrawer('${o.orderNumber}')">
      <td class="mono" style="font-weight:600">${o.orderNumber}</td>
      <td style="color:#666;font-size:12px">${o.createdAt}</td>
      <td>${agent ? agent.name : o.agentCode} <span class="tier T${o.agentTier}">T${o.agentTier}</span></td>
      <td>${o.customerName}</td>
      <td class="num mono">${fmt(orderRetail(o))}</td>
      <td class="num mono">${fmt(orderAgentCost(o))}</td>
      <td class="num mono" style="color:#19884a">${fmt(orderYourProfit(o))}</td>
      <td><span class="status ${o.status}">${o.status}</span></td>
    </tr>`;
  }).join('');
}

// ── Order Drawer ────────────────────────────────────────────
function openDrawer(orderNumber) {
  selectedOrderId = orderNumber;
  const o = ORDERS.find(x => x.orderNumber === orderNumber);
  if (!o) return;
  const agent = AGENTS.find(a => a.code === o.agentCode);

  document.getElementById('drawerTitle').textContent = `訂單 ${o.orderNumber}`;
  document.getElementById('drawerSub').textContent = o.createdAt;

  const itemsHTML = o.items.map(i => {
    const subRetail = i.unitRetail * i.qty;
    const subCost = Math.round(subRetail * o.agentDiscount);
    return `
      <tr>
        <td style="font-size:12px"><span class="mono" style="color:#888">${i.code || '—'}</span><br>${i.name}</td>
        <td class="num">${i.qty}</td>
        <td class="num mono">${fmt(i.unitRetail)}</td>
        <td class="num mono">${fmt(subRetail)}</td>
        <td class="num mono" style="color:#666">${fmt(subCost)}</td>
      </tr>
    `;
  }).join('');

  const retail = orderRetail(o);
  const agentCost = orderAgentCost(o);
  const yourCost = orderYourCost(o);
  const profit = orderYourProfit(o);

  document.getElementById('drawerBody').innerHTML = `
    <dl class="info-grid">
      <dt>業務</dt><dd>${agent ? agent.name : '—'} (${o.agentCode}) <span class="tier T${o.agentTier}">T${o.agentTier} · ${o.agentDiscount * 10}折進貨</span></dd>
      <dt>客人</dt><dd>${o.customerName}</dd>
      <dt>電話</dt><dd>${o.customerPhone || '—'}</dd>
      <dt>地址</dt><dd>${o.address || '—'}</dd>
      <dt>付款</dt><dd>${o.payment}</dd>
      <dt>狀態</dt><dd><span class="status ${o.status}">${o.status}</span></dd>
    </dl>

    <div class="section-title">商品明細</div>
    <table style="font-size:12px;width:100%">
      <thead>
        <tr>
          <th style="font-size:10px">商品</th>
          <th class="num" style="font-size:10px">數量</th>
          <th class="num" style="font-size:10px">原價</th>
          <th class="num" style="font-size:10px">原價小計</th>
          <th class="num" style="font-size:10px">業務進貨</th>
        </tr>
      </thead>
      <tbody>${itemsHTML}</tbody>
    </table>

    <div class="breakdown-card">
      <div class="breakdown-row"><span class="label">原價總額（業績計算）</span><span class="mono">${fmt(retail)}</span></div>
      <div class="breakdown-row"><span class="label">業務折扣</span><span class="mono">${o.agentDiscount * 10}折</span></div>
      <div class="breakdown-row total"><span>業務應付給你</span><span class="mono">${fmt(agentCost)}</span></div>
      <div class="breakdown-row" style="margin-top:10px"><span class="label">你的進貨成本（6折）</span><span class="mono" style="color:#999">−${fmt(yourCost)}</span></div>
      <div class="breakdown-row total"><span>你的毛利</span><span class="profit mono">${fmt(profit)}</span></div>
    </div>
  `;

  // Footer buttons based on status
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

function updateStatus(newStatus) {
  const o = ORDERS.find(x => x.orderNumber === selectedOrderId);
  if (!o) return;
  o.status = newStatus;
  renderKPIs();
  renderOrders();
  renderAgents();
  renderReport();
  updatePendingBadge();
  openDrawer(selectedOrderId); // refresh drawer
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
    const stats = agentMonthlyStats(a.code, ORDERS);
    const calcTier = getTierByMonthlyRetail(stats.retailSum);
    const next = getNextTier(calcTier.tier);
    const currentRule = TIER_RULES.find(t => t.tier === a.currentTier);

    // progress within current tier
    const tierMin = calcTier.minRetail;
    const tierMax = next ? next.minRetail : tierMin * 1.5;
    const progress = Math.min(100, ((stats.retailSum - tierMin) / (tierMax - tierMin)) * 100);
    const remaining = next ? next.minRetail - stats.retailSum : 0;

    const lockedBadge = a.manualOverride
      ? `<span title="等級已鎖定" style="font-size:10px;color:#666;margin-left:4px">🔒</span>`
      : '';
    return `
    <tr>
      <td><strong>${a.name}</strong><br><span style="font-size:11px;color:#888">${a.phone || '—'}</span></td>
      <td class="mono">${a.code}</td>
      <td>
        <span class="tier T${a.currentTier}">T${a.currentTier}</span> ${currentRule.name}${lockedBadge}
        ${(calcTier.tier !== a.currentTier && !a.manualOverride) ? `<br><span style="font-size:10px;color:#c97c14">⚠ 下月將調整至 T${calcTier.tier}</span>` : ''}
      </td>
      <td class="mono">${currentRule.discount * 10}折</td>
      <td style="min-width:200px">
        <div class="tier-bar"><div class="tier-bar-fill ${calcTier.tier === 2 ? 't2' : calcTier.tier === 3 ? 't3' : ''}" style="width:${progress}%"></div></div>
        <div class="tier-progress-text mono">${fmt(stats.retailSum)}${next ? ` · 還差 ${fmt(remaining)} 升 T${next.tier}` : ' · 已達最高階'}</div>
      </td>
      <td class="num">${stats.orderCount}</td>
      <td class="num mono">${fmt(stats.agentCostSum)}</td>
      <td class="num mono" style="color:#19884a">${fmt(stats.yourProfit)}</td>
      <td><button class="btn ghost sm" onclick="openEditAgentModal('${a.code}')">編輯</button></td>
    </tr>`;
  }).join('');
}

// ── New Agent Modal ──────────────────────────────────────────
function openNewAgentModal() {
  document.getElementById('newAgentModal').classList.add('open');
  // suggest next code
  const lastNum = AGENTS.map(a => parseInt(a.code.replace(/\D/g, ''))).filter(n => !isNaN(n));
  const next = Math.max(...lastNum) + 1;
  document.getElementById('newAgentCode').value = 'A' + String(next).padStart(3, '0');
}
function closeNewAgentModal() {
  document.getElementById('newAgentModal').classList.remove('open');
  ['newAgentName', 'newAgentPhone'].forEach(id => document.getElementById(id).value = '');
}
function saveNewAgent() {
  const name = document.getElementById('newAgentName').value.trim();
  const code = document.getElementById('newAgentCode').value.trim();
  const phone = document.getElementById('newAgentPhone').value.trim();
  const tier = parseInt(document.getElementById('newAgentTier').value);
  if (!name || !code) { alert('請填寫姓名與業務代碼'); return; }
  if (AGENTS.find(a => a.code === code)) { alert('業務代碼已存在'); return; }
  AGENTS.push({
    code, name, phone, currentTier: tier,
    joinedAt: new Date().toISOString().slice(0, 10),
    manualOverride: false,
  });
  // also add to filter
  const agentSel = document.getElementById('agentFilter');
  const opt = document.createElement('option');
  opt.value = code;
  opt.textContent = `${name} (${code})`;
  agentSel.appendChild(opt);
  renderAgents();
  closeNewAgentModal();
}

// ── Edit Agent Modal ─────────────────────────────────────────
function openEditAgentModal(code) {
  const a = AGENTS.find(x => x.code === code);
  if (!a) return;
  document.getElementById('editAgentOriginalCode').value = a.code;
  document.getElementById('editAgentName').value = a.name;
  document.getElementById('editAgentCode').value = a.code;
  document.getElementById('editAgentPhone').value = a.phone || '';
  document.getElementById('editAgentTier').value = String(a.currentTier);
  document.getElementById('editAgentManualOverride').checked = !!a.manualOverride;
  document.getElementById('editAgentJoined').value = a.joinedAt || '';
  document.getElementById('editAgentModal').classList.add('open');
}
function closeEditAgentModal() {
  document.getElementById('editAgentModal').classList.remove('open');
}
function saveEditAgent() {
  const origCode = document.getElementById('editAgentOriginalCode').value;
  const a = AGENTS.find(x => x.code === origCode);
  if (!a) return;

  const newName = document.getElementById('editAgentName').value.trim();
  const newCode = document.getElementById('editAgentCode').value.trim();
  const newPhone = document.getElementById('editAgentPhone').value.trim();
  const newTier = parseInt(document.getElementById('editAgentTier').value);
  const newOverride = document.getElementById('editAgentManualOverride').checked;
  const newJoined = document.getElementById('editAgentJoined').value;

  if (!newName || !newCode) { alert('姓名與代碼為必填'); return; }
  if (newCode !== origCode && AGENTS.find(x => x.code === newCode)) {
    alert('業務代碼已被使用'); return;
  }

  // If code changed, also update all order references
  if (newCode !== origCode) {
    ORDERS.forEach(o => { if (o.agentCode === origCode) o.agentCode = newCode; });
  }

  a.name = newName;
  a.code = newCode;
  a.phone = newPhone;
  a.currentTier = newTier;
  a.manualOverride = newOverride;
  a.joinedAt = newJoined || a.joinedAt;

  // Refresh the agent filter dropdown in orders view
  const sel = document.getElementById('agentFilter');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">全部業務</option>' +
    AGENTS.map(x => `<option value="${x.code}">${x.name} (${x.code})</option>`).join('');
  sel.value = currentVal === origCode ? newCode : currentVal;

  renderAgents();
  renderOrders();
  renderKPIs();
  renderReport();
  closeEditAgentModal();
}
function deleteAgent() {
  const origCode = document.getElementById('editAgentOriginalCode').value;
  const a = AGENTS.find(x => x.code === origCode);
  if (!a) return;

  const orderCount = ORDERS.filter(o => o.agentCode === origCode).length;
  const msg = orderCount > 0
    ? `確定要刪除業務「${a.name}」？\n\n注意：該業務名下有 ${orderCount} 筆訂單，刪除後這些訂單將顯示為「無業務帶單」。`
    : `確定要刪除業務「${a.name}」？`;
  if (!confirm(msg)) return;

  // Mark orders as orphaned (null agent) instead of deleting them
  ORDERS.forEach(o => { if (o.agentCode === origCode) o.agentCode = null; });
  const idx = AGENTS.indexOf(a);
  AGENTS.splice(idx, 1);

  // Refresh filter
  const sel = document.getElementById('agentFilter');
  sel.innerHTML = '<option value="">全部業務</option>' +
    AGENTS.map(x => `<option value="${x.code}">${x.name} (${x.code})</option>`).join('');

  renderAgents();
  renderOrders();
  renderKPIs();
  renderReport();
  closeEditAgentModal();
}

// ── Monthly Report ───────────────────────────────────────────
function renderReport() {
  const valid = ORDERS.filter(o => o.status !== '已取消');
  const retail = valid.reduce((s, o) => s + orderRetail(o), 0);
  const agentCost = valid.reduce((s, o) => s + orderAgentCost(o), 0);
  const yourCost = valid.reduce((s, o) => s + orderYourCost(o), 0);
  const profit = agentCost - yourCost;

  document.getElementById('rRetail').textContent = fmt(retail);
  document.getElementById('rAgentCost').textContent = fmt(agentCost);
  document.getElementById('rYourCost').textContent = fmt(yourCost);
  document.getElementById('rProfit').textContent = fmt(profit);

  // Agent ranking
  const agentSums = AGENTS.map(a => ({
    agent: a, stats: agentMonthlyStats(a.code, ORDERS),
  })).sort((a, b) => b.stats.retailSum - a.stats.retailSum);
  const maxRetail = Math.max(...agentSums.map(x => x.stats.retailSum), 1);

  document.getElementById('agentRanking').innerHTML = agentSums.map(x => `
    <div class="bar-row">
      <div class="nm">${x.agent.name} <span class="tier T${x.agent.currentTier}" style="font-size:9px;padding:1px 5px">T${x.agent.currentTier}</span></div>
      <div class="bar"><div class="bar-fill" style="width:${(x.stats.retailSum / maxRetail) * 100}%"></div></div>
      <div class="amt mono">${fmt(x.stats.retailSum)}</div>
    </div>
  `).join('') || '<div style="color:#aaa;padding:10px">尚無資料</div>';

  // Series ranking
  const seriesMap = {};
  valid.forEach(o => {
    o.items.forEach(i => {
      // try to find series from product name prefix
      const series = inferSeries(i.name);
      seriesMap[series] = (seriesMap[series] || 0) + i.unitRetail * i.qty;
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

// ── Month switcher (mock) ────────────────────────────────────
const MONTHS = ['2026 / 5月 ▾', '2026 / 4月 (歷史) ▾', '2026 / 3月 (歷史) ▾'];
let monthIdx = 0;
function cycleMonth() {
  monthIdx = (monthIdx + 1) % MONTHS.length;
  document.getElementById('monthPill').textContent = MONTHS[monthIdx];
  // demo only - mock months show same data
}

// ── Export CSV ───────────────────────────────────────────────
function exportCSV() {
  const headers = ['訂單號', '日期', '業務', '客人', '電話', '地址', '付款', '原價', '實收', '毛利', '狀態'];
  const rows = ORDERS.map(o => {
    const agent = AGENTS.find(a => a.code === o.agentCode);
    return [
      o.orderNumber, o.createdAt, agent ? agent.name : o.agentCode,
      o.customerName, o.customerPhone || '', o.address || '',
      o.payment, orderRetail(o), orderAgentCost(o), orderYourProfit(o), o.status,
    ];
  });
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `POLA-訂單-2026-05.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

init();
