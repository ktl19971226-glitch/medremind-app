# TestFlight Checklist

## 已完成

- Capacitor iOS project: `ios/`
- App name: `賺大錢`
- Bundle ID in Xcode project: `app.zhuandachian.private`
- Apple Developer Bundle ID: `Zhuan Da Qian / app.zhuandachian.private`
- App Store provisioning profile: `money-maker-appstore-2026`
- Profile ID: `5SAR6NQ28P`
- App Store Connect App ID: `6786379398`
- Version: `1.0`
- Build: `1`
- Camera permission: done
- Photo library permission: done
- iOS app icon: done
- GitHub Actions workflow: `.github/workflows/build-ios-testflight.yml`

## Apple 後台狀態

Apple API key 可以讀取 Bundle ID、profiles、certificates，但建立 Bundle ID / profile 會被 403 擋下，因此已改用瀏覽器完成 Apple Developer 後台操作。

已下載 profile 到：

- `private_artifacts/ios-signing/money-maker-appstore-2026.mobileprovision`
- `private_artifacts/ios-signing/money-maker-appstore-2026.mobileprovision.base64`

Workflow 會用 App Store Connect API 讀取 profile ID `5SAR6NQ28P`，不需要額外新增 profile secret。

既有 secrets 需在執行 workflow 的 GitHub repo 中可用：

- `IOS_DISTRIBUTION_P12_BASE64`
- `IOS_DISTRIBUTION_P12_PASSWORD`
- `IOS_KEYCHAIN_PASSWORD`
- `APPSTORE_KEY_ID`
- `APPSTORE_ISSUER_ID`
- `APPSTORE_PRIVATE_KEY_BASE64`

## 仍需完成

- 將 `money-maker-app` 放到 GitHub repo，或併入現有可跑 Actions 的 repo。
- 跑 `.github/workflows/build-ios-testflight.yml` 上傳 IPA 到 App Store Connect。
- 若只跑 TestFlight，不需要填完整上架素材與送正式審查。

## AI 後端

TestFlight App 內的 AI 掃描會呼叫 App 裡設定的「AI 伺服器」網址。後端必須部署 `money-maker-app/server.js`，並在伺服器環境變數設定：

```bash
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
PORT=8092
```
