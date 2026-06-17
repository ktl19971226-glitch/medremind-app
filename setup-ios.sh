#!/bin/bash
echo "📱 藥記得 iOS 設定開始..."

# 1. 安裝依賴
echo "📦 安裝 npm 套件..."
npm install

# 2. 建立 iOS 專案
echo "🍎 建立 iOS 原生專案..."
npx cap add ios

# 3. 同步前端資源
echo "🔄 同步前端到 iOS..."
npx cap sync ios

# 4. 產生 App 圖示（iOS 需要多種尺寸）
echo "🎨 產生 iOS App 圖示..."

# 5. 打開 Xcode
echo ""
echo "✅ 設定完成！接下來："
echo "  1. Xcode 會自動打開"
echo "  2. 接上你的 iPhone"
echo "  3. 左上角選擇你的 iPhone"
echo "  4. 按 ▶️ 執行"
echo ""
npx cap open ios
