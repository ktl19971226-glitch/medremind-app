const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'https://local-alert.yaojidecare.app';
const maybeOwner = process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {};
const maybeEasProject = process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {};

module.exports = {
  expo: {
    name: '在地雷達',
    slug: 'local-alert',
    scheme: 'localalert',
    ...maybeOwner,
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#f8fafc'
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'app.yaojidecare.localalert',
      buildNumber: '1',
      icon: './assets/icon.png',
      config: {
        usesNonExemptEncryption: false
      },
      infoPlist: {
        CFBundleDisplayName: '在地雷達',
        NSUserNotificationsUsageDescription: '在地雷達會傳送所在地點的即時提醒與測試通知。',
        NSLocationWhenInUseUsageDescription: '在地雷達可依你設定的地點提供在地提醒；目前不會自動讀取定位。'
      },
      entitlements: {
        'aps-environment': 'production'
      }
    },
    android: {
      package: 'app.yaojidecare.localalert',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#f8fafc'
      },
      permissions: ['POST_NOTIFICATIONS']
    },
    notification: {
      icon: './assets/notification-icon.png',
      color: '#2563eb',
      iosDisplayInForeground: true
    },
    plugins: [
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#2563eb',
          sounds: []
        }
      ]
    ],
    extra: {
      apiBase: API_BASE,
      ...maybeEasProject
    }
  }
};
