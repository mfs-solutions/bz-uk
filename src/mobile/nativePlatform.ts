import { Capacitor } from '@capacitor/core';

export const isNativePlatform = Capacitor.isNativePlatform();
export const nativePlatform = Capacitor.getPlatform();
export const isNativeIOS = isNativePlatform && nativePlatform === 'ios';
export const isNativeAndroid = isNativePlatform && nativePlatform === 'android';
