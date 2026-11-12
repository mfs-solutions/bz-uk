// Unified push identity sync — keeps native/web token ownership bound to the current user.
// One of them is a no-op depending on the current platform.
import { setNativePushExternalId } from '../mobile/nativePushNotifications';
import { setWebPushExternalId } from './oneSignalWeb';

export async function syncOneSignalExternalId(userId: string | null): Promise<void> {
  await Promise.allSettled([
    setNativePushExternalId(userId),
    setWebPushExternalId(userId),
  ]);
}
