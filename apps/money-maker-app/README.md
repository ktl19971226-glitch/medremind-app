# 賺大錢

自用 TestFlight App MVP。第一版用來記錄：

- 和泰托運：配送日期、流水號、運送區間、附加費用
- 泰中托運：廠商名稱、送貨日期、單號
- 油耗成本：加油日期、油品、公升數、金額、里程
- 保養紀錄：保養日期、車牌、保修廠、項目、工資、零件、稅金、應收合計

## 本機啟動

```bash
cp .env.example .env
npm install
npm run dev
```

開啟 `http://localhost:8092`。

## AI 掃描

後端使用 `GEMINI_API_KEY` 呼叫 Gemini。金鑰只放在伺服器環境變數，不要放進前端或 iOS App。

```bash
GEMINI_API_KEY=你的金鑰 npm run dev
```

TestFlight 版內建正式後端網址，App 畫面不顯示伺服器 API 欄位；瀏覽器本機測試會使用目前網頁來源。

## 私有同步

App 會自動產生一組私有同步碼，資料同步到 money-maker 後端的獨立加密檔案，不寫進藥護家或其他 App 的資料庫。後端只提供 pull/push，沒有公開列表或搜尋全部資料的 API。

正式機建議設定：

```bash
MONEY_MAKER_DATA_DIR=/opt/money-maker-app/data/vaults
```

## iOS

```bash
npx cap add ios
npx cap sync ios
```

Bundle ID 已建立為 `app.zhuandachian.private`。

TestFlight 進度與 Apple 後台待辦請看 `docs/testflight-checklist.md`。
