const appUrl =
  process.env.KOOBD_APP_URL ||
  process.env.KOOBD_DEVICE_URL ||
  'http://192.168.1.14:8080/log.php';
const appName = process.env.KOOBD_APP_NAME || 'KoobD';

const config = {
  appId: 'com.koobd.app',
  appName,
  webDir: 'www',
  backgroundColor: '#eef9ff',
  bundledWebRuntime: false,
  server: {
    url: appUrl,
    cleartext: appUrl.startsWith('http://'),
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      backgroundColor: '#eef9ff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#1f2947',
      overlaysWebView: false
    }
  }
};

export default config;
