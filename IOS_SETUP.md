# 🍎 iOS 測試安裝（免開發者帳號）

## 你需要
- MacBook（你已經有了 ✅）
- iPhone + 傳輸線
- Xcode（App Store 免費下載）

## 步驟

### 1️⃣ 下載專案
解壓 `medremind-app.tar.gz` 到桌面

### 2️⃣ 打開終端機
```bash
cd ~/Desktop/medremind-app
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

### 3️⃣ Xcode 自動打開
- 接上 iPhone
- 左上角選你的 iPhone
- 按 ▶️ 執行

---

## ⚠️ 如果 Xcode 說需要簽名

Xcode → 點專案名稱 → Signing & Capabilities → Team → 選你的 Apple ID

（不用付費，免費 Apple ID 也能裝到自己的 iPhone 上測試）

---

## 📱 啟動後
App 會連回伺服器 `220.135.250.9:8050`，確保伺服器有在跑。
