# POLA 訂單系統 — API 規格

給後端工程師：依此規格實作 API，前端不用改即可串接。

## 基本資訊

- **Base URL**：`https://your-api.railway.app`（前端 `app.js` 中 `SHOP_API` 變數對應）
- **資料格式**：所有請求/回應皆為 `application/json`
- **時區**：所有日期時間以 `Asia/Taipei` 處理
- **金額**：所有金額為整數 NTD（不含小數）
- **認證**：管理者 / 業務後台需登入；客人下單不需登入

---

## 資料模型

### Agent（業務）
```ts
{
  code: string;              // 業務代碼，URL 用，例 "A001"，全域 unique
  name: string;              // 姓名
  phone: string;             // 聯絡電話
  current_tier: 1 | 2 | 3;   // 當前等級（每月 1 號自動結算更新）
  manual_override: boolean;  // true = 鎖定等級，自動結算時略過
  joined_at: string;         // YYYY-MM-DD
  created_at: string;        // ISO timestamp
}
```

### Order（訂單）
```ts
{
  order_number: string;        // YYMMDD-NNN 自動生成，例 "260528-007"
  agent_code: string | null;   // 業務代碼，null = 沒有業務帶單
  customer_name: string;       // 必填
  customer_phone: string|null;
  customer_address: string|null;
  payment_method: "匯款"|"現金"|"Line Pay";
  notes: string | null;
  status: "待確認"|"已確認"|"已出貨"|"已取消";
  agent_tier: 1|2|3;           // 下單當下業務的 tier（鎖定，後續升降級不影響歷史）
  agent_discount: number;      // 下單當下的折扣，例 0.75
  retail_total: number;        // 原價總額（業績計算）
  agent_cost_total: number;    // 業務應付給公司 = retail_total × agent_discount
  items: OrderItem[];
  created_at: string;          // ISO
  confirmed_at: string | null;
  shipped_at: string | null;
}

type OrderItem = {
  product_code: string | null;  // 商品序號，例 "6403"
  product_name: string;
  product_series: string | null;
  variant_label: string | null; // 例 "P1" / "01 盛放玫紅"
  unit_price: number;           // 原價（單價）
  quantity: number;
}
```

### Tier 規則（後端寫死或可後台調）
```ts
const TIERS = [
  { tier: 1, min: 0,      max: 70000,  discount: 0.80 },
  { tier: 2, min: 70000,  max: 140000, discount: 0.75 },
  { tier: 3, min: 140000, max: null,   discount: 0.70 },
];
const YOUR_COST_RATE = 0.60;  // 你跟原廠的拿貨折扣
```

---

## 對外 API（客人目錄頁用）

### 1. POST `/api/orders` — 建立訂單
**Auth**：無

**Request**
```json
{
  "agent_code": "A002",
  "customer_name": "陳太太",
  "customer_phone": "0912-345-678",
  "customer_address": "台北市...",
  "payment_method": "匯款",
  "notes": null,
  "items": [
    {
      "product_code": "6403",
      "product_name": "B.A 極光全能精萃",
      "product_series": "B.A grandluxe",
      "variant_label": null,
      "unit_price": 22000,
      "quantity": 1
    }
  ]
}
```

**Server-side 邏輯**
1. 驗證 `agent_code` 存在；不存在則設為 null
2. 查 agent 當前 `current_tier`，鎖定 `agent_tier` 與 `agent_discount` 到此訂單
3. `retail_total = sum(unit_price × quantity)`
4. `agent_cost_total = round(retail_total × agent_discount)`
5. 生成 `order_number`：`YYMMDD-NNN`（NNN 為當日流水號，從 001 開始）
6. status 預設 `待確認`
7. 入庫後觸發 LINE 通知（見「整合」段）

**Response 200**
```json
{
  "order_number": "260528-007",
  "status": "待確認",
  "agent_tier": 2,
  "agent_discount": 0.75,
  "retail_total": 22000,
  "agent_cost_total": 16500,
  "created_at": "2026-05-28T14:32:18+08:00"
}
```

**Error**
- `400` 缺欄位 / items 為空
- `500` 伺服器錯誤

---

### 2. GET `/api/agents/{code}` — 取得業務資訊（前端帶 `?agent=` 時呼叫）
**Auth**：無

**Response 200**
```json
{
  "code": "A002",
  "name": "李美麗",
  "current_tier": 2,
  "discount_rate": 0.75
}
```
**Response 404**：業務不存在（前端直接忽略，照原價走）

---

## 管理者 API（老闆後台用）

> 統一前綴 `/api/admin/*`，需 JWT / Session 認證

### 3. GET `/api/admin/orders`
**Query params**
- `month` — `2026-05`（預設本月）
- `status` — 篩選狀態
- `agent_code` — 篩選業務
- `q` — 搜尋訂單號 / 客人名 / 電話
- `page`, `limit`

**Response**
```json
{
  "total": 81,
  "page": 1,
  "limit": 20,
  "items": [ /* Order[] with full details */ ]
}
```

### 4. PATCH `/api/admin/orders/{order_number}/status`
**Body**: `{ "status": "已確認" | "已出貨" | "已取消" | "待確認" }`

狀態變更時自動填入對應時間戳（`confirmed_at` / `shipped_at`），並重算當月業務業績統計。

### 5. GET `/api/admin/dashboard/kpi?month=2026-05`
**Response**
```json
{
  "month": "2026-05",
  "order_count": 81,
  "cancelled_count": 3,
  "retail_total": 308200,
  "agent_cost_total": 240396,
  "your_cost_total": 184920,
  "your_profit": 55476,
  "pending_count": 7
}
```

### 6. GET `/api/admin/agents` — 業務列表 + 本月業績
**Response**
```json
[
  {
    "code": "A002", "name": "李美麗", "phone": "...",
    "current_tier": 2, "joined_at": "2025-11-02",
    "monthly_stats": {
      "month": "2026-05",
      "retail_sum": 98000,
      "order_count": 12,
      "agent_cost_sum": 73500,
      "your_profit_sum": 14700,
      "calculated_tier_next_month": 2
    }
  }
]
```

### 7. POST `/api/admin/agents` — 新增業務
**Body**: `{ code, name, phone, current_tier }`

### 8. PATCH `/api/admin/agents/{code}` — 編輯業務
可改：`name`, `phone`, `current_tier`, `manual_override`

### 9. GET `/api/admin/reports/monthly?month=2026-05`
**Response**
```json
{
  "month": "2026-05",
  "summary": { /* same as KPI */ },
  "agent_ranking": [
    { "code": "A003", "name": "張大姐", "retail_sum": 165000 }
  ],
  "series_ranking": [
    { "series": "B.A grandluxe", "retail_sum": 51000 }
  ],
  "tier_distribution": { "T1": 2, "T2": 2, "T3": 1 }
}
```

---

## 業務 API（業務後台用）

> 統一前綴 `/api/agent/*`，業務本人登入後只能看自己的資料

### 10. GET `/api/agent/me`
回傳自己的 Agent + 本月業績（同 `monthly_stats`）

### 11. GET `/api/agent/orders?month=2026-05`
只回傳自己的訂單（自動以登入身份過濾）

---

## 排程任務

### 月底結算（每月 1 號 00:00 跑）
1. 抓取上個月所有「非取消」訂單的 `retail_total` 加總，計算每個 agent 的月業績
2. 依 `TIERS` 計算下個月應有的 tier
3. 若 `manual_override = false` → 更新 `agent.current_tier`
4. 寫入 `agent_tier_history` 表留審計軌跡
5. 寄送月結報表 mail / LINE 通知給每位業務

**`agent_tier_history` 表**
```
agent_code, month, prev_tier, new_tier, retail_sum, changed_at, auto: boolean
```

---

## 整合

### LINE 通知（訂單入庫即推播）
- 使用 LINE Messaging API 或 LINE Notify
- 訂單建立後：通知「老闆」+ 對應「業務」
- 訊息範本：
  ```
  🛍 新訂單 260528-007
  業務：李美麗 (T2)
  客人：陳太太 0912-345-678
  原價：NTD 22,000 → 業務應付：NTD 16,500
  → 點此查看：https://admin.example.com/orders/260528-007
  ```

### 訂單編號流水號
- 每日 00:00 重新從 001 開始
- 用 Redis `INCR` 或資料庫 row lock 確保並發安全

---

## 建議技術棧

| 層 | 選項 A（推薦：快速上線）| 選項 B（自架） |
|---|---|---|
| 後端 | Supabase（Postgres + Auth + Realtime） | FastAPI / Hono on Railway |
| DB | Supabase Postgres | Postgres / SQLite |
| 認證 | Supabase Auth（magic link）| JWT |
| 老闆後台 | 已實作 `admin.html`（直接打 Supabase）| 同左 |
| 通知 | LINE Notify webhook | 同左 |
| 部署 | Vercel + Supabase | Railway |

---

## 部署前 Checklist

- [ ] 將 `app.js` 中 `SHOP_API` 改成正式網域
- [ ] 後端開啟 CORS 允許前端網域
- [ ] 後端 rate limit `POST /api/orders`（防灌單）
- [ ] 訂單 phone / address 做基本格式驗證
- [ ] 後台登入加 2FA（避免老闆帳號被盜）
- [ ] 每日資料庫備份
- [ ] 訂單號碼流水號的並發測試（同一秒多筆下單）
- [ ] LINE 通知失敗時的 fallback（mail / 重試佇列）
