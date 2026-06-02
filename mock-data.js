// ─────────────────────────────────────────────────────────────
// 階級規則（前後端共用）
// 顧問與訂單資料皆從後端 API 取得，不放 mock 假資料
// ─────────────────────────────────────────────────────────────

const TIER_RULES = [
  { tier: 1, label: 'T1', name: '新階', minRetail: 0,       maxRetail: 100000,  discount: 0.80 },
  { tier: 2, label: 'T2', name: '中階', minRetail: 100000,  maxRetail: 200000,  discount: 0.75 },
  { tier: 3, label: 'T3', name: '資深', minRetail: 200000,  maxRetail: Infinity, discount: 0.70 },
];

const STORE_TIER_RULES = [
  { tier: 1, label: 'S1', name: '店家',     minRetail: 0,       maxRetail: 300000,  discount: 0.75 },
  { tier: 2, label: 'S2', name: '店家高階', minRetail: 300000,  maxRetail: Infinity, discount: 0.70 },
];

const YOUR_COST_RATE = 0.60;

function getTierByMonthlyRetail(retail) {
  return TIER_RULES.find(t => retail >= t.minRetail && retail < t.maxRetail) || TIER_RULES[0];
}
function getNextTier(currentTier) {
  return TIER_RULES.find(t => t.tier === currentTier + 1) || null;
}

const AGENTS = [];
const ORDERS = [];

function orderRetail(o) {
  return (o.items || []).reduce((s, i) => s + (i.unitRetail || 0) * (i.qty || 0), 0);
}
function orderAgentCost(o) {
  return Math.round(orderRetail(o) * (o.agentDiscount || 1));
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
