import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yaojidecare.xiaoyue',
  appName: '小約',
  webDir: 'www',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'automatic'
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#ffffff'
    }
  }
};

export default config;
