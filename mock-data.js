// ─────────────────────────────────────────────────────────────
// Shared mock data for admin / agent dashboards
// 在實際串接後端時，這些資料會來自 API
// ─────────────────────────────────────────────────────────────

const TIER_RULES = [
  { tier: 1, label: 'T1', name: '新階',   minRetail: 0,       maxRetail: 70000,  discount: 0.80 },
  { tier: 2, label: 'T2', name: '中階',   minRetail: 70000,   maxRetail: 140000, discount: 0.75 },
  { tier: 3, label: 'T3', name: '資深',   minRetail: 140000,  maxRetail: Infinity, discount: 0.70 },
];

const YOUR_COST_RATE = 0.60; // 你跟原廠拿貨是 6 折

function getTierByMonthlyRetail(retail) {
  return TIER_RULES.find(t => retail >= t.minRetail && retail < t.maxRetail) || TIER_RULES[0];
}

function getNextTier(currentTier) {
  return TIER_RULES.find(t => t.tier === currentTier + 1) || null;
}

// 業務名單 ───────────────────────────────────────────────────
const AGENTS = [
  { code: 'A001', name: '王小美', phone: '0912-345-678', currentTier: 1, joinedAt: '2026-03-15', manualOverride: false },
  { code: 'A002', name: '李美麗', phone: '0922-456-789', currentTier: 2, joinedAt: '2025-11-02', manualOverride: false },
  { code: 'A003', name: '張大姐', phone: '0933-567-890', currentTier: 3, joinedAt: '2024-08-20', manualOverride: false },
  { code: 'A004', name: '陳婷婷', phone: '0955-789-012', currentTier: 1, joinedAt: '2026-04-28', manualOverride: false },
  { code: 'A005', name: '林雅芳', phone: '0966-890-123', currentTier: 2, joinedAt: '2025-06-10', manualOverride: false },
];

// 訂單樣本（本月 2026/05） ───────────────────────────────────
// retail_total = 原價總額（業績計算）
// agent_cost   = 業務實付（原價 × agent_discount）
// your_profit  = agent_cost - 原價 × 0.60
const ORDERS = [
  {
    orderNumber: '260528-007', agentCode: 'A003', customerName: '陳太太', customerPhone: '0987-111-222',
    address: '台北市中山區民生東路三段100號', payment: '匯款', status: '待確認',
    agentTier: 3, agentDiscount: 0.70,
    items: [
      { code: '6403', name: 'B.A 極光全能精萃', qty: 1, unitRetail: 22000 },
      { code: '0321', name: 'B.A 新生奇蹟護唇膏', qty: 2, unitRetail: 2200 },
    ],
    createdAt: '2026-05-28 14:32',
  },
  {
    orderNumber: '260528-006', agentCode: 'A002', customerName: '林小姐', customerPhone: '0911-222-333',
    address: '高雄市前金區中正四路200號', payment: 'Line Pay', status: '已確認',
    agentTier: 2, agentDiscount: 0.75,
    items: [
      { code: '5613', name: 'WRINKLE SHOT 全面抗皺前導精萃', qty: 1, unitRetail: 4800 },
      { code: '5610', name: 'WRINKLE SHOT 抗皺精華霜 N', qty: 1, unitRetail: 4400 },
    ],
    createdAt: '2026-05-28 11:08',
  },
  {
    orderNumber: '260527-005', agentCode: 'A001', customerName: '黃小姐', customerPhone: '0922-333-444',
    address: '台中市西屯區市政路50號', payment: '現金', status: '已出貨',
    agentTier: 1, agentDiscount: 0.80,
    items: [{ code: '4924', name: 'Red B.A 清潔霜', qty: 1, unitRetail: 1750 }],
    createdAt: '2026-05-27 16:45',
  },
  {
    orderNumber: '260527-004', agentCode: 'A003', customerName: '王太太', customerPhone: '0933-444-555',
    address: '台北市信義區松仁路88號', payment: '匯款', status: '已出貨',
    agentTier: 3, agentDiscount: 0.70,
    items: [
      { code: '6412', name: 'B.A 極光全能夜間緊緻霜', qty: 1, unitRetail: 29000 },
      { code: '6420', name: 'B.A 新生奇蹟賦活霜', qty: 1, unitRetail: 10000 },
    ],
    createdAt: '2026-05-27 09:22',
  },
  {
    orderNumber: '260526-003', agentCode: 'A002', customerName: '蔡小姐', customerPhone: '0955-555-666',
    address: '新北市板橋區文化路一段150號', payment: 'Line Pay', status: '已確認',
    agentTier: 2, agentDiscount: 0.75,
    items: [
      { code: '0544', name: 'WHITE SHOT 擊速煥白化妝水 LX', qty: 1, unitRetail: 3900 },
      { code: '0553', name: 'WHITE SHOT 擊速煥白無瑕淨透精華', qty: 1, unitRetail: 5000 },
      { code: '0545', name: 'WHITE SHOT 擊速煥白乳液 MX', qty: 1, unitRetail: 3900 },
    ],
    createdAt: '2026-05-26 20:14',
  },
  {
    orderNumber: '260525-002', agentCode: 'A005', customerName: '吳小姐', customerPhone: '0966-666-777',
    address: '桃園市中壢區中央西路80號', payment: '匯款', status: '已出貨',
    agentTier: 2, agentDiscount: 0.75,
    items: [
      { code: '6001', name: 'ALLU 奧麗清潔霜', qty: 2, unitRetail: 1700 },
      { code: '6002', name: 'ALLU 奧麗洗面乳', qty: 2, unitRetail: 1700 },
    ],
    createdAt: '2026-05-25 13:50',
  },
  {
    orderNumber: '260524-001', agentCode: 'A001', customerName: '謝小姐', customerPhone: '0977-777-888',
    address: '台南市東區崇學路30號', payment: '現金', status: '已取消',
    agentTier: 1, agentDiscount: 0.80,
    items: [{ code: '4928', name: 'Red B.A 修護滋養乳霜', qty: 1, unitRetail: 4000 }],
    createdAt: '2026-05-24 18:30',
  },
  {
    orderNumber: '260523-008', agentCode: 'A003', customerName: '周太太', customerPhone: '0988-888-999',
    address: '台北市大安區敦化南路二段200號', payment: '匯款', status: '已出貨',
    agentTier: 3, agentDiscount: 0.70,
    items: [
      { code: '6416', name: 'B.A 新生奇蹟精華水', qty: 1, unitRetail: 6200 },
      { code: '6418', name: 'B.A 新生奇蹟精華乳', qty: 1, unitRetail: 6200 },
      { code: '6420', name: 'B.A 新生奇蹟賦活霜', qty: 1, unitRetail: 10000 },
    ],
    createdAt: '2026-05-23 10:15',
  },
  {
    orderNumber: '260520-009', agentCode: 'A002', customerName: '張小姐', customerPhone: '0999-000-111',
    address: '新竹市東區光復路二段100號', payment: 'Line Pay', status: '已出貨',
    agentTier: 2, agentDiscount: 0.75,
    items: [
      { code: '5403', name: 'GROWING SHOT 健髮洗髮精', qty: 2, unitRetail: 900 },
      { code: '5404', name: 'GROWING SHOT 健髮潤髮乳', qty: 2, unitRetail: 900 },
      { code: '5402', name: 'GROWING SHOT 健髮露 BK', qty: 1, unitRetail: 2250 },
    ],
    createdAt: '2026-05-20 15:00',
  },
  {
    orderNumber: '260518-010', agentCode: 'A003', customerName: '柯小姐', customerPhone: '0900-111-222',
    address: '台北市內湖區瑞光路500號', payment: '匯款', status: '已出貨',
    agentTier: 3, agentDiscount: 0.70,
    items: [
      { code: '6403', name: 'B.A 極光全能精萃', qty: 1, unitRetail: 22000 },
    ],
    createdAt: '2026-05-18 12:00',
  },
  {
    orderNumber: '260515-011', agentCode: 'A002', customerName: '游太太', customerPhone: '0911-333-444',
    address: '台北市文山區木柵路三段80號', payment: '匯款', status: '已出貨',
    agentTier: 2, agentDiscount: 0.75,
    items: [
      { code: '0358', name: 'B.A 活性精華液', qty: 1, unitRetail: 7000 },
      { code: '0394', name: 'B.A 按摩霜', qty: 1, unitRetail: 4400 },
    ],
    createdAt: '2026-05-15 19:20',
  },
  {
    orderNumber: '260512-012', agentCode: 'A001', customerName: '簡小姐', customerPhone: '0922-444-555',
    address: '基隆市仁愛區愛三路100號', payment: '現金', status: '已出貨',
    agentTier: 1, agentDiscount: 0.80,
    items: [
      { code: '4182', name: 'WHITISSIMO 優皙清潔霜', qty: 1, unitRetail: 1650 },
      { code: '4184', name: 'WHITISSIMO 優皙化妝水', qty: 1, unitRetail: 1950 },
    ],
    createdAt: '2026-05-12 14:10',
  },
  {
    orderNumber: '260510-013', agentCode: 'A005', customerName: '潘小姐', customerPhone: '0933-555-666',
    address: '台中市北屯區崇德路二段300號', payment: 'Line Pay', status: '已出貨',
    agentTier: 2, agentDiscount: 0.75,
    items: [
      { code: '2831', name: 'PENSÉE DE BOUQUET 沁香滋潤修護身體乳', qty: 3, unitRetail: 1000 },
    ],
    createdAt: '2026-05-10 11:30',
  },
];

// ── helpers ──────────────────────────────────────────────────
function orderRetail(o) {
  return o.items.reduce((s, i) => s + i.unitRetail * i.qty, 0);
}
function orderAgentCost(o) {
  return Math.round(orderRetail(o) * o.agentDiscount);
}
function orderYourCost(o) {
  return Math.round(orderRetail(o) * YOUR_COST_RATE);
}
function orderYourProfit(o) {
  return orderAgentCost(o) - orderYourCost(o);
}
function fmt(n) {
  return 'NTD ' + (n || 0).toLocaleString();
}
function agentMonthlyStats(agentCode, monthOrders) {
  const valid = monthOrders.filter(o => o.agentCode === agentCode && o.status !== '已取消');
  return {
    orderCount: valid.length,
    retailSum: valid.reduce((s, o) => s + orderRetail(o), 0),
    agentCostSum: valid.reduce((s, o) => s + orderAgentCost(o), 0),
    yourProfit: valid.reduce((s, o) => s + orderYourProfit(o), 0),
  };
}
