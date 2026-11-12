import { initializeNativeImageInputBridge } from './nativeFileInputBridge';
import { initializeNativeLiveWebSync } from './liveWebSync';
import { initializeNativePushNotifications } from './nativePushNotifications';
import { initializeOneSignalWeb } from '../lib/oneSignalWeb';
import { isNativePlatform, isNativeAndroid, isNativeIOS } from './nativePlatform';

// Tag <html>/<body> with platform classes so layout CSS can target the native
// shell without affecting the web build. Web users never get these classes.
function applyNativePlatformClasses() {
  if (!isNativePlatform || typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;
  root.classList.add('native-app');
  body.classList.add('native-app');
  if (isNativeAndroid) {
    root.classList.add('native-android');
    body.classList.add('native-android');
  }
  if (isNativeIOS) {
    root.classList.add('native-ios');
    body.classList.add('native-ios');
  }
}

export function initializeNativeBootstrap() {
  applyNativePlatformClasses();
  initializeNativeImageInputBridge();
  initializeNativeLiveWebSync();
  void initializeNativePushNotifications();
  void initializeOneSignalWeb();
}
