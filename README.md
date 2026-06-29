# Local Alert App

全方位在地資訊提醒 App。採用 Expo 手機 App + Node.js 後端提醒引擎。

## 功能範圍

- 天氣環境：降雨、高低溫、空氣品質、地震、警戒
- 交通移動：通勤路線、公共運輸、道路事故、施工
- 生活市政：垃圾車、停水、停電、瓦斯施工、公告
- 安全警示：火災、事故、治安、避難資訊
- 個人生活：帳單、包裹、行事曆、藥物、家務

## 開發啟動

```bash
npm install
npm run api
npm run mobile
```

API 預設 port：`8061`。

手機推播使用 Expo Push Token。手機 App 會向後端註冊 token，後端可透過 `/api/test-push` 測試推播。

## 已新增的產品功能

- 初次設定：每台手機會建立獨立 device scope，設定主要監控地點並啟用推播。
- 使用者隔離：規則、地點、提醒、裝置 token 依 `X-Device-Id` 分開。
- 地點管理：新增、編輯、刪除地點，並可使用目前定位帶入城市與行政區。
- 提醒中心：未讀數、提醒詳情、全部已讀、單筆已讀、封存。
- 推播規則：支援一般/重大提醒，排程提醒會尊重 quiet hours，重大警示不靜音。
- 資料源框架：可用 `CWA_API_KEY` / `MOENV_API_KEY` 接天氣、地震、空氣品質；未設定時會回退系統範例。
- 管理摘要：`/api/admin/summary` 可查看裝置、使用者、地點、提醒與啟用規則數。

## iOS 原生 App

手機端已產生 iOS 原生工程：`apps/mobile/ios`。

正式 App 設定：

- App 名稱：`在地雷達`
- Bundle ID：`app.yaojidecare.localalert`
- API：`https://local-alert.yaojidecare.app`
- iOS 版本：`1.0.0`
- Build Number：`2`

常用指令：

```bash
cd apps/mobile
npm run prebuild:ios
npm run ios
npm run build:ios
npm run submit:ios
```

上架前需要在 Apple Developer / App Store Connect 完成：

- 建立 App ID：`app.yaojidecare.localalert`
- 開啟 Push Notifications capability
- 建立 App Store Connect App，填入同一個 Bundle ID
- 執行 `eas init` 取得 EAS Project ID；若要讓 Expo Push Token 穩定運作，請把它設為 `EAS_PROJECT_ID`
- 設定 `ASC_APP_ID` 後再執行 `npm run submit:ios`
