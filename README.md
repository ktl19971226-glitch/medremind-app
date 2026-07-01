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
- 真實資料源：可用 `CWA_API_KEY` 接天氣、地震、颱風細預報；空氣品質已內建 MOENV 公開 JSON 檢視來源，也可用 `MOENV_API_KEY` 覆蓋；TDX 與各模組外部 URL 可接交通、市政、安全、個人資料，且已內建地方道路事故/施工、公車/客運營運通阻解析。未設定時會標示「資料源未設定」，不再產生仿真的範例提醒。
- 安全控管：初次設定後會核發 device secret，後續寫入 API 需同時帶 `X-Device-Id` 與 `X-Device-Secret`。
- 管理摘要：設定 `ADMIN_TOKEN` 後，`/api/admin/summary` 需帶 `X-Admin-Token` 才能查看裝置、使用者、地點、提醒與啟用規則數。

## 後端環境變數

- `PORT`：API port，預設 `8061`
- `ADMIN_TOKEN`：啟用管理摘要 API 的存取 token；未設定時管理摘要關閉
- `ALERTS_PER_DEVICE`：每台裝置最多保留提醒數，預設 `300`
- `CWA_API_KEY`：中央氣象署正式資料源金鑰；未設定時部分天氣警戒會走 NCDR CAP
- `MOENV_API_KEY`：環境部正式資料源金鑰；未設定時 `air-quality` 會走資料開放平臺公開 JSON 檢視來源
- `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`：交通/運輸資料源金鑰
- `LOCAL_ALERT_SOURCE_<MODULE>_URL`：各模組外部資料源 URL，例如 `LOCAL_ALERT_SOURCE_GARBAGE_TRUCK_URL`、`LOCAL_ALERT_SOURCE_WATER_OUTAGE_URL`、`LOCAL_ALERT_SOURCE_BILL_URL`
- `RAIN_NOTIFY_THRESHOLD` / `AQI_NOTIFY_THRESHOLD`：降雨與 AQI 推播門檻

內建免金鑰資料源：

- 台灣自來水停水資訊 JSON：`water-outage`
- EMIC 台灣電力公司災情通報表 JSON：`power-outage`
- 經濟部能源署災害期間公用天然氣停氣資訊 CSV：`gas-work`
- 內政部警政署婦幼安全警示地點 CSV：`crime-watch`
- 內政部警政署即時交通事故資料 A1 JSON：`accident`（重大交通事故公開資料；不當成即時推播）
- 中央氣象署 F-D0047 鄉鎮天氣預報公開檔：`rain`、`temperature`（22 縣市鄉鎮市區未來 3 天天氣；正式 key 未設定時仍可用）
- 中央氣象署 W-C0034-005 颱風路徑公開檔：`typhoon`（颱風/熱帶性低氣壓資料；正式 key 未設定時仍可用）
- 中央氣象署 E-A0015-005 鄉鎮震度公開檔：`earthquake`（最新有感地震鄉鎮震度；正式 key 未設定時仍可用）
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
- NCDR 民生示警 CAP JSON：`rain`、`temperature`、`earthquake`、`typhoon`、`transit`、`evacuation`、`local-bulletin`、`accident`（全台灣；CWA key 未設定時作為官方示警來源，並接臺鐵營運異常/停駛警戒）
- PTX/MOTC 臺鐵即時到離站 LiveBoard JSON：`transit`（全台灣臺鐵列車即時到離站與延誤；TDX key 未設定時仍可用）
- 22 縣市政府官方入口：`local-bulletin`（地方公告/市政或縣政新聞入口；一般公告不推播，重大民生示警仍以 NCDR CAP 優先）
- 環境部空氣品質指標 AQI JSON：`air-quality`（全台灣；正式 key 優先，未設定時走政府資料開放平臺公開 JSON 檢視來源）
- 高速公路局 TISVCloud LiveEvents XML：`commute`、`road-incident`、`roadwork`（全台灣國道即時事件；有定位時優先回附近事件）
- 臺北市今日施工資訊 JSON：`roadwork`（臺北市道路挖掘即時施工通報，每 10 分鐘更新）
- 新北市政府道路挖掘資訊 JSON、桃園市本日道路申挖、臺南市道路挖掘當日施工 XML、高雄市道路挖掘資訊 XML、宜蘭縣道路挖掘管理 XML：`roadwork`
- TDX 城市道路交通消息：`road-incident`、`roadwork`（22 縣市地方道路事故、壅塞、施工與交管消息；需 `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`）
- PTX/MOTC 公車/客運營運通阻 JSON：`transit`（22 縣市市區公車與公路客運通阻；TDX key 未設定時 fallback）
- 基隆市停車場剩餘車位 HTML：`parking`（基隆市）
- 新竹市剩餘停車位資訊 JSON + 官方停車服務入口 fallback：`parking`（新竹市）
- 新竹縣政府路邊停車中心：`parking`（新竹縣；官方停車資訊入口，未提供即時剩餘車位 API）
- 苗栗縣政府停車服務資訊：`parking`（苗栗縣；官方停車資訊入口，未提供即時剩餘車位 API）
- 南投縣政府停車服務資訊：`parking`（南投縣；官方停車地圖/收費公告，未提供即時剩餘車位 API）
- 雲林縣 TDX 衍生停車公開查詢頁：`parking`（雲林縣；即時剩餘車位）
- 彰化縣路邊停車智慧車格 POST API：`parking`（彰化縣；依路段彙整即時可用車格）
- 嘉義縣路邊停車管理：`parking`（嘉義縣；官方停車資訊入口，未提供即時剩餘車位 API）
- 嘉義市智慧停車場管理雲端平臺 HTML：`parking`（嘉義市）
- 屏東縣 TDX 衍生停車公開查詢頁：`parking`（屏東縣；即時剩餘車位）
- 花蓮縣 TDX 衍生停車公開查詢頁：`parking`（花蓮縣；即時剩餘車位）
- 臺東縣停車資訊網停車場車位表：`parking`（臺東縣；官方停車場車位表，未提供即時剩餘車位 API）
- 澎湖縣停車資料即時查詢：`parking`（澎湖縣；官方停車服務入口，未提供即時剩餘車位 API）
- 金門縣 TDX 衍生停車公開查詢頁：`parking`（金門縣；即時剩餘車位）
- 連江縣智慧停車平台 API：`parking`（連江縣；即時剩餘車位）
- 臺北市停車管理工程處停車場剩餘車位 JSON：`parking`（臺北市）
- 新北市公有路外停車場即時賸餘車位數 JSON：`parking`（新北市）
- 桃園市路外停車資訊 JSON：`parking`（桃園市）
- 臺中市路外剩餘車位 JSON：`parking`（臺中市）
- 臺南市停車場即時剩餘車位 SOA JSON：`parking`（臺南市）
- 高雄市停車場即時資訊 POST API：`parking`（高雄市）
- 宜蘭縣停車場停車位即時剩餘數 JSON：`parking`（宜蘭縣）
- 臺北市政府消防局 119 即時案件 JSON：`fire`（臺北市；只取火警/災害搶救，不取一般救護）
- 基隆市消防局火災資訊 HTML：`fire`（基隆市；官方火災資訊，非即時派遣，不推播）
- 新竹市消防局救災救護 HTML：`fire`（新竹市；官方救災救護資訊，非即時派遣，不推播）
- 新竹縣政府消防局即時災情 HTML：`fire`（新竹縣；火警/災害搶救，不拿一般救護冒充）
- 新北市消防救援動態 GeoJSON：`fire`（新北市）
- 桃園市政府消防局即時災情 HTML：`fire`（桃園市；火警/災害搶救，已完成案件不推播）
- 臺中市政府消防局即時災情 HTML：`fire`（臺中市；火警/災害搶救，不拿一般救護冒充）
- 臺南市政府消防局即時災情 HTML：`fire`（臺南市；火警/災害搶救，不拿一般救護冒充）
- 苗栗縣政府消防局 119 即時案件 HTML：`fire`（苗栗縣；火警/災害搶救，不拿一般救護冒充）
- 彰化縣消防局即時災情 HTML：`fire`（彰化縣；火警/災害搶救，不拿一般救護冒充）
- 南投縣政府消防局 119 訊息 HTML：`fire`（南投縣；火警/災害搶救，不拿一般救護冒充）
- 內政部消防署災情訊息：`fire`（雲林縣；中央官方火災/重大災情 fallback，不當成地方即時派遣）
- 嘉義縣消防局即時災情 HTML：`fire`（嘉義縣；火警/災害搶救，不拿一般救護冒充）
- 嘉義市消防局火警案件即時災情 HTML：`fire`（嘉義市；火警/災害搶救，不拿一般救護冒充）
- 高雄市政府消防局即時案件 HTML：`fire`（高雄市；火警/災害搶救，不拿一般救護冒充）
- 宜蘭縣政府消防局 119 即時災情 HTML：`fire`（宜蘭縣；火警/災害搶救，不拿一般救護冒充）
- 屏東防災資訊整合平台 119 消息 HTML：`fire`（屏東縣；火警/災害搶救，不拿一般救護冒充）
- 內政部消防署災情訊息：`fire`（花蓮縣、臺東縣、金門縣、連江縣；中央官方火災/重大災情 fallback，不當成地方即時派遣）
- 澎湖縣政府消防局即時災情訊息 HTML：`fire`（澎湖縣；火警/災害搶救，不拿一般救護冒充）
- 臺北捷運營運燈號網頁：`transit`（臺北市、新北市；正常營運回無即時事件，異常才推播）
- 台灣高鐵列車運行狀況網頁：`transit`（全台灣；正常營運回無即時事件，異常才推播）
- 桃園捷運最新營運狀態網頁：`transit`（桃園市；正常營運回無即時事件，異常才推播）
- 臺中捷運營運狀態網頁：`transit`（臺中市；正常營運回無即時事件，異常才推播）
- 高雄捷運重要公告網頁：`transit`（高雄市；官方公告補底，未解析到明確異常時不推播）
- TDX 公車/客運營運通阻：`transit`（22 縣市市區公車 + 公路客運通阻事件；需 `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`）
- 內政部警政署 165 打詐儀錶板 JSON：`fraud-alert`（全台灣；防詐跑馬燈、今日常見詐騙手法、宣導資源）

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
