# App 上架流程與工具清單

本文件整理自「藥護家」實際上架流程，可作為下一個 App 的上架檢查表。不要把任何 `.p8`、`.p12`、keystore、service account JSON 或 base64 後的私鑰內容提交到 Git。

## 1. 基本資料先定案

- App 顯示名稱、英文名稱、支援信箱。
- iOS Bundle ID，例如 `app.yaojidecare`。
- Android package/applicationId，例如 `app.yaojidecare`。
- 正式網站網域、隱私權政策 URL、使用者條款 URL。
- App icon、splash、商店截圖、描述、關鍵字、分類、審查備註。
- 版本號與 build number 規則。

注意：iOS Bundle ID 與 Android package name 上架後都不應再改。

## 2. 本機與 CI 工具

- Node.js / npm。
- Capacitor CLI：`npx cap sync ios`、`npx cap sync android`。
- Xcode 與 macOS runner，用於 iOS archive / export IPA。
- Android SDK / JDK / Gradle，用於 Android AAB。
- GitHub Actions，用於自動打包與上傳 App Store Connect。
- SSH，用於正式機部署與檢查服務。

藥護家目前 iOS workflow：

- `.github/workflows/build-ios-ipa.yml`
- 觸發方式：修改 `trigger-build.txt` 或手動 `workflow_dispatch`。
- 主要流程：npm install -> Capacitor sync -> 安裝簽名材料 -> xcodebuild archive -> export IPA -> upload artifact -> altool 上傳 App Store Connect。

## 3. Apple Developer / App Store Connect

需要 Apple Developer Program 權限，且要能進行 2FA。

必做：

- 建立 App ID / Identifier，Bundle ID 要與專案一致。
- 開啟需要的 Capabilities：
  - In-App Purchase。
  - Push Notifications（若要 APNs 遠端推播）。
  - 其他能力依 App 需求開啟。
- 建立 App Store Connect App record。
- 設定 App 資訊、分類、年齡分級、價格、隱私權問卷、出口合規。
- 建立 TestFlight Internal Testers 群組。
- 上傳 IPA 後把 build 加到 TestFlight。

簽名材料：

- Apple Distribution certificate，匯出 `.p12`。
- App Store provisioning profile，需包含正確 Bundle ID 與 capabilities。
- 若啟用 Push Notifications，要重產 provisioning profile，確認含 `aps-environment=production`。

GitHub Secrets 需要：

- `IOS_DISTRIBUTION_P12_BASE64`：Distribution `.p12` 的 base64。
- `IOS_DISTRIBUTION_P12_PASSWORD`：`.p12` 密碼。
- `IOS_APPSTORE_PROFILE_BASE64`：App Store provisioning profile 的 base64，或改用 App Store Connect API 動態下載。
- `IOS_KEYCHAIN_PASSWORD`：CI 臨時 keychain 密碼。
- `APPSTORE_KEY_ID`：App Store Connect API key id。
- `APPSTORE_ISSUER_ID`：App Store Connect issuer id。
- `APPSTORE_PRIVATE_KEY_BASE64`：App Store Connect API `.p8` 私鑰 base64。

藥護家實作補充：

- workflow 目前支援用 App Store Connect API 下載指定 profile。
- `exportOptions.plist` 的 `teamID`、Bundle ID、profile name 都要換成新 App。
- Xcode 專案內 `PRODUCT_BUNDLE_IDENTIFIER`、`PROVISIONING_PROFILE_SPECIFIER` 要換成新 App。

## 4. TestFlight 驗證

每次送測前檢查：

- build number 已遞增。
- IPA 上傳 App Store Connect 成功。
- App Store Connect build 狀態為 `VALID`。
- build 已加入 Internal Testers。
- iPhone 使用 TestFlight 安裝最新版。
- App 內基本流程可走通：登入/建立帳號、核心功能、通知、購買、恢復購買。

## 5. APNs 遠端推播

Apple 端：

- App ID 開 Push Notifications。
- Provisioning profile 重產並確認含 `aps-environment=production`。
- Xcode 加 entitlements，例如 `aps-environment=production`。
- 建立 APNs Auth Key `.p8`。

正式機環境變數：

```bash
APNS_KEY_ID=你的 APNs Key ID
APNS_TEAM_ID=你的 Apple Team ID
APNS_AUTH_KEY_BASE64=APNs .p8 base64
APNS_BUNDLE_ID=你的 Bundle ID
APNS_ENV=production
```

App 端：

- 安裝 Capacitor Push Notifications plugin。
- 使用者允許通知後取得 APNs token。
- 登入後把 token 註冊到後端。

後端：

- 儲存裝置 token。
- 用 APNs JWT 發送通知。
- 後台需能看 APNs configured 狀態與裝置 token 數。

## 6. Apple 金流 / RevenueCat

Apple 端：

- 在 App Store Connect 建立 Subscription Group。
- 建立 Auto-Renewable Subscriptions，例如：
  - 月訂閱 product id。
  - 年訂閱 product id。
- 填價格、顯示名稱、審查資料。
- 狀態可能會先是 `Waiting for Review`，正式販售要等 Apple 審核。

RevenueCat 端：

- 建立 Project。
- 新增 iOS App，Bundle ID 要一致。
- 建立 Entitlement，例如 `pro`。
- 建立或使用 `default` Offering。
- 匯入 App Store Connect 商品。
- 把月費商品綁到 monthly package，把年費商品綁到 annual package。
- 上傳 Apple In-App Purchase Key。
- 上傳 App Store Connect API Key 與 vendor number。
- 取得 iOS public SDK key。

RevenueCat / Apple 需要的 key：

- Apple In-App Purchase Key `.p8`：給 RevenueCat 驗證 App Store 交易。
- App Store Connect API Key `.p8`：給 RevenueCat / CI 存取 App Store Connect。
- RevenueCat public SDK key：放正式站環境變數，可給 App 端讀取。

正式機環境變數：

```bash
REVENUECAT_IOS_API_KEY=appl_xxxxxxxxxxxxxxxxxxxxxxxxx
REVENUECAT_ANDROID_API_KEY=goog_xxxxxxxxxxxxxxxxxxxxxxxxx
SUBSCRIPTION_ENTITLEMENT_ID=pro
PRO_MONTHLY_PRODUCT_ID=your_app_pro_monthly
PRO_YEARLY_PRODUCT_ID=your_app_pro_yearly
```

後端需提供：

- `/api/subscription/status`：回傳方案、商品 ID、RevenueCat key 設定狀態、使用者 Pro 狀態。
- `/api/subscription/revenuecat-sync`：App 購買或恢復購買後，把 RevenueCat `customerInfo` 同步到後端。

App 端需提供：

- 顯示月費/年費。
- 購買。
- 恢復購買。
- 根據 entitlement 更新 Pro 狀態。

## 7. Android / Google Play

Google Play Console：

- 建立 App record。
- package name 要與 Android `applicationId` 一致。
- 上傳 release AAB。
- 建立 internal testing / closed testing。
- 填 Data Safety、內容分級、App access、廣告聲明、隱私權政策。
- 準備手機截圖、短描述、完整描述、feature graphic。

簽名材料：

- Android upload keystore `.jks`。
- keystore 密碼、key alias、key password。
- 不要提交到 Git。

Firebase / FCM 遠端推播：

- 建立 Firebase project。
- 建立 Android App，package name 要一致。
- 下載 `google-services.json` 放到 Android 專案。
- 建立 Firebase service account JSON。

正式機環境變數：

```bash
FIREBASE_SERVICE_ACCOUNT_JSON=完整 JSON 或
FIREBASE_SERVICE_ACCOUNT_BASE64=service account JSON base64
FIREBASE_PROJECT_ID=你的 Firebase project id
```

RevenueCat Android：

- 在 RevenueCat 新增 Android App。
- 在 Google Play 建立同名 subscription product id。
- RevenueCat 匯入商品並綁到同一個 entitlement。
- 正式機補 `REVENUECAT_ANDROID_API_KEY`。

## 8. AdMob / 廣告

需要：

- AdMob account。
- iOS App ID。
- Android App ID。
- Rewarded ad unit id 或其他廣告單元。
- `app-ads.txt` 放到正式網域。

App 端：

- iOS / Android 分別填正式 ad unit id。
- 測試期間使用 Google test ad unit，正式版確認切成正式 ad unit。
- 若涉及追蹤型廣告，iOS 需處理 ATT 與 App Privacy 更新。

## 9. 正式站部署

需要：

- 正式主機 SSH。
- systemd service 名稱。
- 正式 env 檔路徑。
- DB 備份策略。
- Service worker cache version 更新策略。

每次部署建議：

1. 備份正式目錄或 DB。
2. 部署 `server.js`、`public/`、`database.sql`、`package*.json` 等必要檔案。
3. `npm install --omit=dev` 或依專案方式安裝。
4. 重啟 service。
5. 檢查 service active。
6. 檢查關鍵 API 未登入回 401、登入後可用。
7. 檢查 `sw.js` cache 版本。

## 10. 送審前總檢查

- App 名稱、Bundle ID、package name 正確。
- icon / splash / 截圖正確。
- 隱私權政策、條款、支援 URL 可公開存取。
- App Privacy / Data Safety 與實際 SDK 一致。
- 不宣稱醫療診斷、治療、處方能力，若是健康類 App 要清楚定位為提醒/紀錄。
- TestFlight 內部測試通過。
- IAP / RevenueCat 商品與 entitlement 可測。
- Push token 註冊與測試推播可測。
- 後端正式環境變數已設定，服務 active。
- 私鑰沒有提交到 Git，也沒有貼到公開聊天。

