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
- 真實資料源：可用 `CWA_API_KEY` / `MOENV_API_KEY` 接天氣、地震、颱風、空氣品質；TDX 與各模組外部 URL 可接交通、市政、安全、個人資料。未設定時會標示「資料源未設定」，不再產生仿真的範例提醒。
- 安全控管：初次設定後會核發 device secret，後續寫入 API 需同時帶 `X-Device-Id` 與 `X-Device-Secret`。
- 管理摘要：設定 `ADMIN_TOKEN` 後，`/api/admin/summary` 需帶 `X-Admin-Token` 才能查看裝置、使用者、地點、提醒與啟用規則數。

## 後端環境變數

- `PORT`：API port，預設 `8061`
- `ADMIN_TOKEN`：啟用管理摘要 API 的存取 token；未設定時管理摘要關閉
- `ALERTS_PER_DEVICE`：每台裝置最多保留提醒數，預設 `300`
- `CWA_API_KEY` / `MOENV_API_KEY`：正式資料源金鑰；未設定時標示資料源未設定
- `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`：交通/運輸資料源金鑰
- `LOCAL_ALERT_SOURCE_<MODULE>_URL`：各模組外部資料源 URL，例如 `LOCAL_ALERT_SOURCE_GARBAGE_TRUCK_URL`、`LOCAL_ALERT_SOURCE_WATER_OUTAGE_URL`、`LOCAL_ALERT_SOURCE_BILL_URL`
- `RAIN_NOTIFY_THRESHOLD` / `AQI_NOTIFY_THRESHOLD`：降雨與 AQI 推播門檻

內建免金鑰資料源：

- 台灣自來水停水資訊 JSON：`water-outage`
- EMIC 台灣電力公司災情通報表 JSON：`power-outage`
- 臺北市垃圾清運點位 CSV：`garbage-truck`（臺北市）
- 新北市垃圾清運車輛所在位置 JSON：`garbage-truck`（新北市）
- 桃園市垃圾清運路線即時查詢系統：`garbage-truck`（桃園市）
- 新竹市清運車便民查詢網：`garbage-truck`（新竹市）
- 臺中市定時定點垃圾收運地點 JSON：`garbage-truck`（臺中市）
- 臺南市垃圾車 GPS 即時服務 JSON：`garbage-truck`（臺南市）
- 宜蘭縣垃圾清運路線 JSON：`garbage-truck`（宜蘭縣）
- 高雄市垃圾車及資源回收車動態資訊 JSON：`garbage-truck`（高雄市）
- 環境部全國垃圾車清運路線查詢網：`garbage-truck` fallback（22 縣市官方清運路線；無即時 GPS 的縣市不推播）
- 清運e點通 ASP.NET 即時查詢：`garbage-truck`（南投、彰化、臺東、澎湖部分鄉鎮；無執勤車輛時回環境部路線 fallback）
- NCDR 民生示警 CAP JSON：`rain`、`temperature`、`earthquake`、`typhoon`、`evacuation`、`local-bulletin`、`accident`（全台灣；CWA key 未設定時作為官方示警來源）
- 高速公路局 TISVCloud LiveEvents XML：`commute`、`road-incident`、`roadwork`（全台灣國道即時事件；有定位時優先回附近事件）
- 臺北市停車管理工程處停車場剩餘車位 JSON：`parking`（臺北市）
- 新北市公有路外停車場即時賸餘車位數 JSON：`parking`（新北市）
- 臺中市路外剩餘車位 JSON：`parking`（臺中市）
- 臺北市政府消防局 119 即時案件 JSON：`fire`（臺北市；只取火警/災害搶救，不取一般救護）
- 新北市消防救援動態 GeoJSON：`fire`（新北市）
- 臺北捷運營運燈號網頁：`transit`（臺北市、新北市；正常營運回無即時事件，異常才推播）

## iOS 原生 App

手機端已產生 iOS 原生工程：`apps/mobile/ios`。

正式 App 設定：

- App 名稱：`在地雷達`
- Bundle ID：`app.yaojidecare.localalert`
- API：`https://local-alert.yaojidecare.app`
- iOS 版本：`1.0.0`
- Build Number：`4`

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
