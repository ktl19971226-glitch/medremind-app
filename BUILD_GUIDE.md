# 藥護家 App - 上架指南

## 📱 目前已完成

1. ✅ **PWA 支援** — 手機瀏覽器打開 → 可直接「加入主畫面」當 App 用
2. ✅ **Capacitor 專案** — 可打包成 iOS/Android 原生 App
3. ✅ **App Icon** — 已產生各尺寸圖示
4. ✅ **6 國語言** — 中/英/印尼/泰/越/菲

## 🚀 方法一：PWA（最快，免上架）

手機瀏覽器打開 `http://220.135.250.9:8050` → Safari/Chrome 選單 → 「加入主畫面」

✅ 優點：立即可用、免審核、自動更新
❌ 缺點：不在 App Store / Google Play 上

## 📦 方法二：打包 APK/AAB（上架 Google Play）

### 你的電腦需要：
- Android Studio（免費下載）
- Java JDK 17+

### 步驟：
```bash
# 1. 複製整個專案到你的電腦
# 2. 進入專案目錄
cd medremind-app

# 3. 安裝依賴
npm install

# 4. 同步 Capacitor
npx cap sync android

# 5. 用 Android Studio 開啟
npx cap open android

# 6. 在 Android Studio 中：Build → Generate Signed Bundle/APK
```

### Google Play 上架需要：
- Google Play 開發者帳號（一次性 $25 USD）
- 隱私權政策網頁
- App 截圖（手機畫面）
- 應用說明

## 🍎 方法三：打包 IPA（上架 Apple App Store）

### 你需要：
- Mac 電腦
- Xcode（免費下載）
- Apple Developer 帳號（$99/年）

### 步驟：
```bash
# 在 Mac 上：
cd medremind-app
npm install
npx cap add ios
npx cap sync ios
npx cap open ios

# 在 Xcode 中：Product → Archive → Distribute App
```

### App Store 上架需要：
- Apple Developer Program（$99/年）
- 隱私權政策
- App 截圖（多種尺寸）
- App 審核（約 1-2 天）

## ⚠️ 上架前必做

### 1. 更換正式網址
目前 API 網址是 `http://220.135.250.9:8050`，需換成正式域名 + HTTPS：
- 編輯 `capacitor.config.json` 中的 `server.url`

### 2. 隱私權政策
寫一份說明你的 App 收集什麼資料、如何使用

### 3. App 截圖
用手機截圖 6 國語言的畫面

---

## 📋 App Store 資訊模板

**App 名稱：** 藥護家 - AI智慧用藥提醒
**副標題：** 拍照辨識・用藥打卡・家人監督  
**描述：**
藥護家是一款 AI 驅動的智慧用藥管理 App。只需拍照藥袋，AI 即自動辨識藥名、劑量、服用時間、副作用。支援 6 國語言，適合外籍看護與家庭使用。

核心功能：
🤖 AI 拍照辨識 — 拍藥袋自動填入所有資訊
💊 用藥提醒 — 設定每日提醒，打卡追蹤
❤️ 健康追蹤 — 記錄血壓、血糖、體重
👨‍👩‍👧 家庭監督 — 關心家人的用藥狀況
🌏 多語系 — 中/英/印尼/泰/越/菲

**關鍵字：** 用藥提醒, 吃藥, 健康, 醫療, medication, pill reminder
