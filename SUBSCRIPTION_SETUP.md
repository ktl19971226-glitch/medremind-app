# 藥護家 Pro 商店內訂閱設定

最後整理：2026-06-23

## 已定案方案

- 訂閱名稱：藥護家 Pro
- Entitlement ID：`pro`
- 月訂閱商品 ID：`yaojidecare_pro_monthly`
- 年訂閱商品 ID：`yaojidecare_pro_yearly`
- 月訂閱價格：NT$75/月
- 年訂閱價格：NT$750/年

## Pro 解鎖功能

- 無廣告。
- 更多 AI 藥袋辨識額度。
- 家人照護人數增加。
- 進階健康紀錄匯出與備份。

## App Store Connect

1. 在 App Store Connect 建立 App `藥護家` 後，進入 In-App Purchases / Subscriptions。
2. 建立 Subscription Group：`藥護家 Pro`。
3. 建立 Auto-Renewable Subscription：
   - Product ID：`yaojidecare_pro_monthly`
   - Reference Name：`藥護家 Pro 月訂閱`
   - Duration：1 Month
   - Price：NT$75
4. 建立 Auto-Renewable Subscription：
   - Product ID：`yaojidecare_pro_yearly`
   - Reference Name：`藥護家 Pro 年訂閱`
   - Duration：1 Year
   - Price：NT$750
5. 在 Apple Developer / Xcode target 啟用 In-App Purchase capability。
6. 若 RevenueCat 使用 StoreKit 2，依 RevenueCat 後台指示補 App Store Connect API key / In-App Purchase key。

## Google Play Console

1. 進入 Monetize with Play > Products > Subscriptions。
2. 建立訂閱商品：
   - Product ID：`yaojidecare_pro_monthly`
   - Name：`藥護家 Pro 月訂閱`
   - Billing period：Monthly
   - Price：NT$75
3. 建立訂閱商品：
   - Product ID：`yaojidecare_pro_yearly`
   - Name：`藥護家 Pro 年訂閱`
   - Billing period：Yearly
   - Price：NT$750
4. 確認 Google Play app package 是 `app.yaojidecare`。
5. 先在 Internal testing 測試購買流程，再開正式發布。

## RevenueCat

1. 建立 RevenueCat project：`藥護家`。
2. 新增 iOS App，Bundle ID：`app.yaojidecare`。
3. 新增 Android App，Package name：`app.yaojidecare`。
4. 匯入兩個商店商品：
   - `yaojidecare_pro_monthly`
   - `yaojidecare_pro_yearly`
5. 建立 Entitlement：
   - Identifier：`pro`
6. 建立 Offering：
   - Identifier：`default`
   - Monthly package 綁 `yaojidecare_pro_monthly`
   - Annual package 綁 `yaojidecare_pro_yearly`
7. 將 RevenueCat public SDK keys 填到正式站環境變數：

```bash
REVENUECAT_IOS_API_KEY=appl_xxxxxxxxxxxxxxxxxxxxxxxxx
REVENUECAT_ANDROID_API_KEY=goog_xxxxxxxxxxxxxxxxxxxxxxxxx
SUBSCRIPTION_ENTITLEMENT_ID=pro
PRO_MONTHLY_PRODUCT_ID=yaojidecare_pro_monthly
PRO_YEARLY_PRODUCT_ID=yaojidecare_pro_yearly
```

## 程式狀態

- 已安裝 Capacitor RevenueCat SDK：`@revenuecat/purchases-capacitor`。
- 後端 `/api/subscription/status` 會回傳 Pro 方案、商品 ID、RevenueCat public key 設定狀態與目前 entitlement。
- 後端 `/api/subscription/revenuecat-sync` 可接收手機端 RevenueCat `customerInfo` 並同步使用者 Pro 狀態。
- 前端「藥護家 Pro」彈窗已可顯示月訂閱、年訂閱與恢復購買。
- Pro 啟用後，AI 藥袋辨識會跳過免費/廣告額度限制。

## 上架審查注意

- App 內數位功能訂閱需使用 Apple In-App Purchase / Google Play Billing。
- 不要在 App 內引導使用者去外部網站用 Stripe、綠界或藍新購買 Pro 解鎖 App 功能。
- 審查備註需說明付款由 App Store / Google Play 處理，藥護家不會在 App 內收集信用卡資料。
