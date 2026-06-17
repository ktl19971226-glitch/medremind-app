# 📱 藥記得 APP 開發 & 伺服器部署完整規劃

**規劃日期:** 2026-06-16 21:49 GMT+8  
**目標:** 將 Web SPA 轉換為 Native APP + 部署生產伺服器  
**預計周期:** 4-6 週

---

## 🎯 三大階段

### Phase 1：APP 開發（2-3 週）
### Phase 2：伺服器部署（1 週）
### Phase 3：整合 & 上線（1-2 週）

---

## 📱 Phase 1：APP 開發

### 1.1 技術選型

#### 跨平台方案（推薦）

| 方案 | 優點 | 缺點 | 工期 | 成本 |
|------|------|------|------|------|
| **React Native** | 一套代碼兩端用 | 性能稍遜 | 3 週 | 中 |
| **Flutter** | 性能最佳 | 新團隊學習陡 | 4 週 | 中 |
| **Expo** | 開發最快 | 功能受限 | 2 週 | 低 |
| **Native (iOS+Android)** | 性能最優 | 工期長 | 8 週 | 高 |

**推薦：React Native** （平衡性能、工期、成本）

---

### 1.2 APP 功能模塊

```
藥記得 Native APP
├─ 用戶認證模塊
│  ├─ 登入/註冊
│  ├─ 生物識別（指紋/臉部）
│  ├─ 密碼重設
│  └─ 帳號管理
│
├─ 用藥管理模塊
│  ├─ 藥品列表
│  ├─ 用藥提醒（推送通知）
│  ├─ 打卡記錄
│  ├─ 庫存追蹤
│  └─ 過期提醒
│
├─ 健康追蹤模塊
│  ├─ 血壓/血糖/體重記錄
│  ├─ 歷史趨勢圖表
│  ├─ 健康預警
│  └─ 數據匯出
│
├─ 家庭協作模塊
│  ├─ 家庭成員管理
│  ├─ 長輩健康共享
│  ├─ 訊息通知
│  └─ 緊急聯絡
│
├─ 離線功能
│  ├─ 本地數據庫（SQLite）
│  ├─ 自動同步
│  └─ 離線讀寫
│
└─ 推送通知系統
   ├─ 用藥提醒
   ├─ 健康預警
   ├─ 家庭訊息
   └─ 系統通知
```

---

### 1.3 APP 開發架構

#### 前端：React Native

```javascript
// 目錄結構
medremind-app/
├─ app/
│  ├─ screens/
│  │  ├─ AuthStack/
│  │  │  ├─ LoginScreen.js
│  │  │  ├─ RegisterScreen.js
│  │  │  └─ PasswordResetScreen.js
│  │  ├─ AppStack/
│  │  │  ├─ HomeScreen.js
│  │  │  ├─ MedicationsScreen.js
│  │  │  ├─ HealthScreen.js
│  │  │  ├─ FamilyScreen.js
│  │  │  └─ SettingsScreen.js
│  │  └─ SharedScreens/
│  │     ├─ SplashScreen.js
│  │     └─ NotificationsScreen.js
│  │
│  ├─ components/
│  │  ├─ MedicationCard.js
│  │  ├─ HealthChart.js
│  │  ├─ FamilyMemberItem.js
│  │  └─ NotificationBanner.js
│  │
│  ├─ services/
│  │  ├─ api.js（連接後端）
│  │  ├─ auth.js（認證）
│  │  ├─ storage.js（本地存儲）
│  │  ├─ notifications.js（推送）
│  │  └─ sync.js（數據同步）
│  │
│  ├─ redux/
│  │  ├─ slices/
│  │  │  ├─ authSlice.js
│  │  │  ├─ medicationsSlice.js
│  │  │  ├─ healthSlice.js
│  │  │  └─ familySlice.js
│  │  └─ store.js
│  │
│  ├─ utils/
│  │  ├─ validators.js
│  │  ├─ formatters.js
│  │  ├─ encryption.js（客戶端加密）
│  │  └─ permissions.js（權限管理）
│  │
│  ├─ assets/
│  │  ├─ images/
│  │  ├─ fonts/
│  │  └─ icons/
│  │
│  ├─ app.json（App 配置）
│  ├─ App.js（主入口）
│  └─ package.json
│
└─ backend/（共享後端 server.js）
```

#### 後端：Node.js Express（既有）

```javascript
// 後端 API 端點（已實現）
├─ /api/auth/*（認證）
├─ /api/medications/*（用藥管理）
├─ /api/health/*（健康數據）
├─ /api/family/*（家庭協作）
├─ /api/notifications/*（通知）
└─ /api/sync/*（數據同步）
```

---

### 1.4 開發工期估算

| 模塊 | 工時 | 優先級 |
|------|------|--------|
| 認證 & 登入 | 40 小時 | P0 |
| 用藥管理 | 60 小時 | P0 |
| 健康追蹤 | 50 小時 | P0 |
| 推送通知 | 30 小時 | P1 |
| 家庭協作 | 40 小時 | P1 |
| 離線同步 | 50 小時 | P1 |
| UI/UX 優化 | 40 小時 | P2 |
| 測試 & QA | 60 小時 | P0 |
| **總計** | **370 小時** | - |

**所需人力：2 名 React Native 工程師 × 3 週**

---

## 🖥️ Phase 2：伺服器部署

### 2.1 生產伺服器需求

#### 硬體配置

```
選項 1：VPS（推薦中小型）
├─ CPU：2-4 核心
├─ 記憶體：4-8 GB
├─ 硬碟：50-100 GB SSD
├─ 頻寬：10 Mbps 上傳
└─ 月費：NT$1,000-3,000

選項 2：雲服務（推薦企業級）
├─ AWS EC2 t3.medium
├─ Google Cloud n1-standard-1
├─ Azure Standard B2s
└─ 月費：NT$2,000-4,000

選項 3：物理伺服器（資料中心）
├─ 初期投資：NT$50,000+
├─ 月租費：NT$5,000+
└─ 適合：大規模用戶（10,000+ 用戶）
```

**推薦：雲服務（AWS/Google Cloud）** - 自動備份、高可用性、按需擴展

---

### 2.2 伺服器架構

```
internet
   ↓
CDN (Cloudflare/CloudFront)
   ↓
Load Balancer (Nginx)
   ↓
┌─────────────────────────────────┐
│  Web Server Cluster (2-4 節點)  │
├─────────────────────────────────┤
│  Node.js + Express (server.js)  │
│  SSL/TLS 加密                    │
│  Rate Limiting (60 req/min)     │
│  Helmet 安全標頭                 │
└─────────────────────────────────┘
   ↓
┌─────────────────────────────────┐
│  Database Tier                   │
├─────────────────────────────────┤
│  PostgreSQL (主)                 │
│  PostgreSQL (副本 - 備份)        │
│  Redis (緩存)                    │
└─────────────────────────────────┘
   ↓
┌─────────────────────────────────┐
│  Storage & Backup                │
├─────────────────────────────────┤
│  S3/GCS (檔案存儲)              │
│  Daily Backup                    │
│  DR Plan (災難恢復)              │
└─────────────────────────────────┘
```

---

### 2.3 伺服器配置清單

#### 環境變數配置

```bash
# 應用配置
NODE_ENV=production
PORT=8050
ALLOWED_ORIGINS=https://app.example.com,https://web.example.com

# 安全密鑰
JWT_SECRET=*** (32+ 字符)
ENCRYPTION_KEY=*** (32 字符 hex)
SALT_ROUNDS=12

# Gemini API
GEMINI_API_KEY=***

# 數據庫
DB_HOST=db.example.com
DB_PORT=5432
DB_NAME=medremind
DB_USER=***
DB_PASSWORD=***

# Redis 緩存
REDIS_URL=redis://cache.example.com:6379

# 備份配置
BACKUP_SCHEDULE=0 2 * * *（每天凌晨 2 點）
BACKUP_S3_BUCKET=medremind-backups
BACKUP_RETENTION_DAYS=30

# 推送通知
FCM_API_KEY=***（Firebase Cloud Messaging）
APNS_CERTIFICATE=***（Apple Push Notification）

# 監控告警
SENTRY_DSN=***
SLACK_WEBHOOK=***（告警通知）

# 審計日誌
AUDIT_LOG_RETENTION_DAYS=90
```

---

### 2.4 部署流程

```bash
# Step 1: 購買域名 & SSL 證書
domain: medremind.com
ssl: Let's Encrypt (免費)

# Step 2: 配置雲服務
provider: AWS / Google Cloud
instance: t3.medium / n1-standard-1
region: 台灣 (ap-northeast-1)

# Step 3: 配置 Nginx 反向代理
├─ HTTPS 重定向
├─ 負載均衡
├─ 靜態文件快取
└─ 速率限制

# Step 4: 部署應用
git clone <repo>
npm install --production
npm run build
pm2 start server.js

# Step 5: 數據庫初始化
npm run migrate
npm run seed

# Step 6: 備份配置
./scripts/setup-backup.sh

# Step 7: 監控設置
npm install pm2-plus
pm2 install pm2-auto-pull
pm2 install pm2-logrotate
```

---

### 2.5 費用估算

| 項目 | 單價 | 周期 | 總費用 |
|------|------|------|--------|
| 域名註冊 | NT$200 | 1 年 | NT$200 |
| SSL 證書 | 免費 | - | 免費 |
| 雲服務（VPS） | NT$2,500 | 月 | NT$30,000/年 |
| CDN | NT$500 | 月 | NT$6,000/年 |
| 備份存儲 | NT$300 | 月 | NT$3,600/年 |
| 監控工具 | 免費 | - | 免費 |
| **年度總費用** | - | - | **NT$39,800** |

**可選：付費支援** +NT$10,000-20,000/年

---

## 🔗 Phase 3：整合 & 上線

### 3.1 API 版本管理

```javascript
// API 版本控制
GET /api/v1/medications    // 當前版本
GET /api/v2/medications    // 新版本（測試）

// 向後相容性
├─ v1: 舊 APP 持續支持
├─ v2: 新 APP + Web
└─ v3: 未來擴展
```

---

### 3.2 灰度發布策略

```
Week 1: 內部測試（5% 流量）
├─ OpenClaw 團隊 + 核心用戶
└─ 監控：錯誤率、延遲、CPU

Week 2: 測試用戶（25% 流量）
├─ 邀請 100 名測試用戶
└─ 收集反饋、修復 Bug

Week 3: 公開測試（50% 流量）
├─ App Store/Play Store 測試版
└─ 大規模真實用戶測試

Week 4: 正式發布（100% 流量）
├─ App Store 上線
├─ Play Store 上線
└─ 網頁版同步更新
```

---

### 3.3 上線檢查清單

#### 應用層
- [ ] 所有功能測試通過
- [ ] 性能優化（首屏 <3s）
- [ ] 離線功能驗證
- [ ] 推送通知測試
- [ ] 多語言支持（中文/英文）
- [ ] 無障礙功能（字體大小、高對比）

#### 後端層
- [ ] API 負載測試（1000+ 並發）
- [ ] 數據庫性能測試
- [ ] 備份恢復測試
- [ ] 安全掃描（依賴、代碼）
- [ ] 滲透測試通過

#### 運維層
- [ ] CI/CD 流程完成
- [ ] 監控告警配置
- [ ] 日誌收集系統
- [ ] 災難恢復計劃
- [ ] 員工培訓完成

#### 法律/合規
- [ ] 隱私政策更新
- [ ] 用戶協議更新
- [ ] 醫療免責聲明
- [ ] 個資法合規
- [ ] App Store 審核通過

---

## 📊 完整時間軸

```
2026-06-16  ✅ 完成資安修復
             
2026-06-17  開始 APP 開發
2026-06-24  完成認證、用藥管理
2026-07-01  完成健康追蹤、家庭協作
2026-07-08  完成推送、離線同步
2026-07-15  UI/UX 優化、開始測試
2026-07-22  內部測試、修復 Bug
             
2026-07-29  伺服器部署到生產
2026-08-01  灰度測試（5% → 25%）
2026-08-08  灰度測試（25% → 50%）
2026-08-15  App Store 上線
2026-08-22  Play Store 上線
2026-08-29  正式發布（100% 流量）
```

**總周期：11 週（2.5 月）**

---

## 💼 團隊組成

### 開發團隊（推薦配置）

| 角色 | 人數 | 職責 |
|------|------|------|
| React Native 工程師 | 2 | APP 開發 |
| Node.js 後端工程師 | 1 | API/伺服器 |
| DevOps 工程師 | 1 | 伺服器部署 & 維護 |
| QA 工程師 | 1 | 測試 & 品質保證 |
| UI/UX 設計師 | 1 | APP 界面設計 |
| 產品經理 | 1 | 需求 & 協調 |
| **總計** | **7 人** | - |

**預算估算：NT$1,400,000-1,800,000（3 個月）**

---

## 🚀 推薦下一步

### 立即行動（本周）
1. ✅ 完成資安修復（已完成）
2. [ ] 選定 APP 開發團隊
3. [ ] 選定雲服務商
4. [ ] 購買域名 & 申請 SSL

### 近期（1-2 周）
5. [ ] 完成 APP 原型設計
6. [ ] 建立 CI/CD 流程
7. [ ] 配置生產伺服器
8. [ ] 設置監控 & 告警

### 中期（2-4 周）
9. [ ] 開始 APP 開發
10. [ ] 進行伺服器性能測試
11. [ ] 啟動數據庫遷移
12. [ ] 開始灰度測試

---

## 📞 後續支持

### 技術支援
- APP 開發：React Native 專家
- 後端優化：Node.js 性能調優
- 運維管理：DevOps 工程師
- 安全加固：安全審計 & 滲透測試

### 業務支援
- 應用市場發布：App Store/Play Store
- 用戶運營：用戶增長 & 留存
- 數據分析：使用行為分析
- 市場推廣：品牌宣傳 & 獲客

---

## ✨ 最終建議

**優先順序：**
1. 🔴 確保資安（已完成 ✅）
2. 🟠 APP 開發（3 週）
3. 🟡 伺服器部署（1 週）
4. 🟢 上線發布（2-3 週）

**預期成果：**
✅ iOS + Android 原生 APP  
✅ 生產級 Node.js 後端  
✅ 企業級安全 & 可靠性  
✅ 月活躍用戶 10,000+（首年目標）  

---

**簽署：** OpenClaw 協調者  
**日期：** 2026-06-16 21:50 GMT+8  
**狀態：** 📱 **APP 開發規劃完成，可進入實施階段**
