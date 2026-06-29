# 小約 iOS App

這是小約的 Capacitor iOS App 專案。App 內建手機版工作台畫面，不使用 `server.url` 純網站包殼；資料透過正式站 mobile API 同步：

`https://xiaoyue.yaojidecare.app/api/mobile/*`

## 本機準備

```bash
npm install
npm run sync
```

## 在 Mac 上打包

Apple App Store 上傳需要 macOS、Xcode 26 或更新版本，並登入 Apple Developer Team。2026-04-28 起，上傳 iOS / iPadOS App 到 App Store Connect 必須使用 iOS 26 / iPadOS 26 SDK 或更新版本建置。

```bash
npm run open:ios
```

在 Xcode 裡確認：

- Bundle Identifier：`com.yaojidecare.xiaoyue`
- Display Name：`小約`
- Signing Team：你的 Apple Developer Team
- Deployment Target：依 Xcode 建議設定
- Archive 後上傳 App Store Connect

## App Review Notes 草稿

小約是給個人工作室與店家使用的預約管理 App。App 內建手機工作台，可登入後查看營運總覽、管理預約狀態、查看服務項目與客戶資料，並設定 LINE 官方帳號權限與 webhook。App 使用小約正式站 API 同步資料，不是單純開啟網站頁面。

測試帳號請在送審前填入 App Store Connect 的 Review Notes。

## 送審待補

- Apple Developer Team ID / 簽署憑證
- App Store Connect App record
- 測試帳號與密碼
- 隱私權政策 URL
- App Store 截圖與描述
