# App Store 上架資料

## App 基本資料

- 名稱：在地雷達
- Bundle ID：app.yaojidecare.localalert
- App Store Connect App ID：6785566272
- SKU：local-alert-ios
- 分類：Lifestyle 或 Utilities
- 年齡分級：4+
- 版本：1.0.0
- App Store provisioning profile：Local Alert App Store 2026

## 簡短描述

在地雷達整合天氣、交通、市政、安全與個人生活提醒，讓使用者用一個 App 管理重要在地通知。

## 描述草稿

在地雷達是一個在地資訊提醒 App，可依使用者設定的城市與行政區追蹤重要事件。第一版支援天氣環境、交通移動、生活市政、安全警示與個人生活等提醒分類，並可透過手機推播接收最新通知。

主要功能：

- 管理監控地點
- 啟用或停用不同提醒規則
- 手動執行即時檢查
- 接收手機推播與測試通知
- 查看最新提醒列表

## 隱私與權限

- 通知：用於傳送在地提醒與測試推播
- 定位：目前不自動讀取定位，地點由使用者手動輸入
- 資料收集：推播 token、平台、使用者設定的監控地點與提醒規則

## 上架前檢查

- Apple Developer 建立 `app.yaojidecare.localalert`
- App ID 開啟 Push Notifications
- EAS 專案完成 `eas init`
- EAS credentials 建立 iOS distribution certificate 與 provisioning profile
- App Store Connect 建立 App 並取得 `ASC_APP_ID`
- 以實機測試推播註冊與 `/api/test-push`
- 準備 App Store 截圖
