# 藥護家 App Store 上架準備

最後整理：2026-06-20

## 目前專案狀態

- App 顯示名稱：藥護家
- 英文品牌：MedCare Home
- Bundle ID：app.yaojidecare
- 版本號：1.0
- Build：1
- 正式網站：https://yaojidecare.app/
- 隱私權政策：https://yaojidecare.app/privacy.html
- 使用者條款：https://yaojidecare.app/terms.html
- app-ads.txt：https://yaojidecare.app/app-ads.txt
- 支援信箱：admin@yaojidecare.app

## App Store Connect 建議填寫

### App 名稱

藥護家

### 副標題

AI用藥提醒與家人照護

### 分類

- 主要分類：Medical
- 次要分類：Health & Fitness

### 促銷文字

用藥提醒、藥袋辨識、服藥打卡與家人照護一次整理，協助你更安心地管理每日用藥。

### 關鍵字

吃藥提醒,用藥管理,藥袋辨識,服藥紀錄,家人照護,長輩照護

### 描述

藥護家是一款為日常用藥與家人照護設計的提醒工具，協助你記錄用藥、設定提醒、追蹤服藥狀態，並讓家人能在授權後一起關心用藥情況。

主要功能：

- 用藥提醒：建立藥品名稱、時間、天數與提醒設定。
- 服藥打卡：記錄已服藥、延後或漏服狀態。
- AI 藥袋辨識：拍攝或上傳藥袋照片，輔助擷取藥名與用藥資訊。
- 家人照護：透過邀請碼連結家人，授權後查看用藥狀態與發送提醒。
- 健康紀錄：記錄血壓、血糖、體重與體溫等日常健康數據。
- 通知中心：集中查看用藥提醒、家人提醒與系統通知。
- 資料匯出與帳號刪除：可匯出個人資料，也可刪除裝置帳號。

藥護家適合需要管理多種藥品、照顧長輩、協助家人追蹤服藥狀態，或希望把用藥紀錄整理得更清楚的人使用。

重要提醒：

藥護家提供的是提醒、紀錄與資訊整理功能，不提供醫療診斷、治療建議或處方建議。AI 藥袋辨識結果可能不完整或有誤，請務必以藥袋、處方、藥師或醫師說明為準。如有任何用藥疑問，請諮詢合格醫療專業人員。

## App Privacy 隱私標籤建議

### 是否用於追蹤

否。沒有廣告追蹤，沒有跨 App 或跨網站追蹤。

### 會收集且可能連結到使用者的資料

- Health & Fitness：用藥資料、服藥紀錄、健康紀錄、家人照護資料。
- User Content：使用者上傳或拍攝的藥袋/藥品照片、AI 辨識文字結果。
- Identifiers：裝置帳號、藥護家編號、裝置識別碼雜湊、登入 token。
- Contact Info：使用者自行設定的名稱；未來若啟用 Email 登入，也可能包含 Email。
- Diagnostics：伺服器錯誤紀錄、API 狀態紀錄，僅用於維護與安全排查。

### 資料使用目的

- App Functionality：提供用藥提醒、打卡、家人照護、資料同步、AI 辨識。
- Customer Support：處理使用者詢問、帳號刪除、問題排查。
- Analytics：目前不使用第三方分析 SDK；若未來新增，需同步更新隱私標籤與政策。

### 第三方資料處理

- AI 藥袋辨識可能將使用者主動上傳的藥袋/藥品照片送至 AI 服務進行文字辨識。
- 不可宣稱「不收集資料」。
- 不可宣稱 AI 辨識結果可取代醫師、藥師、藥袋或處方。

## Review Notes 建議填寫

藥護家是用藥提醒與家人照護工具，不提供醫療診斷、治療或處方建議。AI 藥袋辨識僅用於輔助輸入文字，使用者仍需自行確認藥袋、處方、醫師或藥師資訊。

測試方式：

1. 開啟 App 後建立/使用裝置帳號。
2. 新增一筆用藥提醒。
3. 測試服藥打卡與通知中心。
4. 可使用家人邀請碼流程測試家人照護。
5. 可使用相機或相簿測試藥袋辨識入口。

如需要測試帳號，請使用 App 內裝置帳號流程；若審查要求固定帳號，需另行建立 reviewer 專用帳號。

## 目前已補強

- iOS App 顯示名稱為「藥護家」。
- iOS bundle id 為 `app.yaojidecare`。
- 隱私權政策與使用者條款已公開上線。
- AdMob app-ads.txt 已公開上線。
- 支援信箱統一為 `admin@yaojidecare.app`。
- `Info.plist` 已補上相機使用說明。
- `Info.plist` 已補上相簿使用說明。
- `Info.plist` 已標示未使用非豁免加密。

## 送審前仍需準備

- App Store Connect 建立 App record。
- 確認 Apple Developer Team 與 Bundle ID `app.yaojidecare`。
- 建立 App Store Distribution certificate。
- 建立 App Store provisioning profile。
- 將 `exportOptions.plist` 從 development/adhoc 改成 App Store 發布用設定，或新增獨立 app-store exportOptions。
- 用正式 distribution 簽名產生可上傳 App Store Connect 的 IPA。
- 將 GitHub Actions 的簽名憑證與 provisioning profile 改由 GitHub Secrets 注入，不要把簽名材料硬寫在 workflow。
- 現有 iOS workflow 只在 `trigger-build.txt` 變更或手動 workflow_dispatch 時才會跑，單純 push 程式碼不會自動產生 IPA。
- 上傳 TestFlight，完成內部測試。
- 準備至少 1 張、建議 5 張 iPhone 截圖。
- 若保留 iPad 支援，需準備 iPad 截圖；若不準備 iPad，建議將 iOS target 改成 iPhone only。
- 填寫 App Privacy 問卷。
- 填寫年齡分級問卷。
- 填寫出口合規問卷，因僅使用標準 HTTPS，通常選擇未使用非豁免加密。
- 確認是否需要醫療器材相關聲明；目前定位應維持為提醒/紀錄工具，不作診斷或治療。

## 官方參考

- App Privacy Details：https://developer.apple.com/app-store/app-privacy-details/
- Screenshot specifications：https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- Product page：https://developer.apple.com/app-store/product-page/
- App Review Guidelines：https://developer.apple.com/app-store/review/guidelines/
