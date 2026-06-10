# 房屋管理系统

最后更新: 2026-06-10

## 技术栈

React 18 + TypeScript 5.8 + Vite 6 + Tailwind CSS 3.4 + Zustand 5 + react-router-dom 7 + Recharts 3.8 + Lucide React + vite-plugin-pwa

## 运行命令

```bash
npm run dev       # 开发
npm run build     # 构建 (tsc + vite build)
npx tsc --noEmit  # 类型检查
```

## 项目结构

```
src/
├── pages/ (10个)
│   ├── Home.tsx          首页 — 统计卡片/月度图表/待办/流水/搜索
│   ├── Properties.tsx    房源列表 — 业主合同管理/收益汇总
│   ├── RoomList.tsx      房间列表 — 每层楼/单元的房间
│   ├── RoomDetail.tsx    房间详情 — 租客合同/账单/续约/退租
│   ├── Tenants.tsx       租客列表 — 筛选
│   ├── Bills.tsx         账单管理 — 按月导航/收款付款拆单
│   ├── Contracts.tsx     合同管理 — 业主合同+租客合同/筛选/搜索
│   ├── Statistics.tsx    统计报表 — 年度收支/月度趋势/入住率/房源对比
│   ├── More.tsx          更多 — 数据备份导入导出/各页面入口
│   └── Trash.tsx         回收站 — 搜索/筛选/批量恢复删除
├── components/ (14个)
│   ├── TenantModal.tsx      租客弹窗 — 两步: 信息→预览
│   ├── BillModal.tsx        账单弹窗
│   ├── PropertyModal.tsx    房源弹窗
│   ├── RoomModal.tsx        房间弹窗
│   ├── LandlordContractModal.tsx  业主合同弹窗
│   ├── CheckoutModal.tsx    退租结算弹窗
│   ├── BillSummaryModal.tsx 账单汇总弹窗
│   ├── BillCard.tsx / BillChart.tsx / BottomNav.tsx
│   ├── PropertyCard.tsx / RoomCard.tsx / StatCard.tsx
│   └── PaymentModal.tsx
├── store/useStore.ts   — Zustand + persist (localStorage)
├── types/index.ts      — 数据模型定义
├── utils/
│   ├── calculator.ts   — 30/360 房租计算 + 分期账单生成
│   └── profit.ts       — 利润计算算法
└── lib/utils.ts        — cn() 工具
```

## 数据模型

```
Property → Room → Tenant → Bill (receivable)
LandlordContract → Bill (payable)
ProfitRecord / TrashItem
```

**Key fields**: Tenant(name, phone, roomId, contractStart/End, monthlyRent, paymentMethod, advanceDays, deposit, status)
**Bill**: amount, type(rent|water|electric|gas|other), status(pending|paid|overdue), direction(payable|receivable), dueDate, paidDate
**PaymentMethod**: monthly | quarterly | semi-annual | annual

## 约定

- 移动端优先: max-w-md mx-auto
- Tailwind 主色: blue-900
- 弹窗底部弹出: rounded-t-3xl, items-end, z-[60]
- 中文 UI, 日期格式 YYYY-MM-DD
- 30/360 算法: 每月=30天, 每年=360天
- 数据在 localStorage, 删除先进回收站
- 换电脑需导出 Excel 再导入
- 种子数据在 buildSeedState()

## PWA

```bash
npm run build
node pwa-server.cjs
# 手机访问 https://192.168.1.185:5174/
```
