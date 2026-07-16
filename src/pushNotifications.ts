import { Capacitor } from '@capacitor/core';
import {
  ActionPerformed,
  PushNotificationSchema,
  PushNotifications,
  Token
} from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firestore } from './firebase';
import { NotificationRoute } from '../types';

export type { NotificationRoute };

type PushInitOptions = {
  userId: string;
  onForegroundNotification?: (notification: PushNotificationSchema) => void;
};

const ROUTE_STORAGE_KEY = 'sa_notification_route';
const TOKEN_STORAGE_KEY = 'sa_fcm_token';
const TOKEN_OWNER_STORAGE_KEY = 'sa_fcm_token_user';
const ANDROID_CHANNEL_ID = 'scholaraxis_updates';
const ANDROID_CHANNEL_NAME = 'ScholarAxis Updates';
const ANDROID_CHANNEL_DESCRIPTION = 'ScholarAxis scholarship updates and alerts';

const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore storage failures
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage failures
    }
  }
};

const parseRouteFromData = (data?: Record<string, unknown> | null): NotificationRoute | null => {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, string | undefined>;
  const screen = record.screen || record.tab || record.route;
  const applicationId = record.applicationId || record.appId;
  const scholarshipId = record.scholarshipId || record.schId;

  if (!screen && !applicationId && !scholarshipId) return null;
  return { screen, applicationId, scholarshipId };
};

const persistRoute = (route: NotificationRoute): void => {
  safeStorage.set(ROUTE_STORAGE_KEY, JSON.stringify(route));
  try {
    window.dispatchEvent(new CustomEvent('scholaraxis:notification-route', { detail: route }));
  } catch {
    // ignore event failures
  }
};

export const consumeNotificationRoute = (): NotificationRoute | null => {
  const raw = safeStorage.get(ROUTE_STORAGE_KEY);
  if (!raw) return null;
  safeStorage.remove(ROUTE_STORAGE_KEY);
  try {
    return JSON.parse(raw) as NotificationRoute;
  } catch {
    return null;
  }
};

export const subscribeToNotificationRoute = (handler: (route: NotificationRoute) => void): (() => void) => {
  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<NotificationRoute>;
    if (customEvent?.detail) handler(customEvent.detail);
  };
  window.addEventListener('scholaraxis:notification-route', listener);
  return () => window.removeEventListener('scholaraxis:notification-route', listener);
};

const ensureAndroidChannel = async (): Promise<void> => {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await PushNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: ANDROID_CHANNEL_NAME,
      description: ANDROID_CHANNEL_DESCRIPTION,
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: 'default'
    });
  } catch {
    // ignore channel creation failures
  }
};

const persistToken = async (userId: string, token: Token): Promise<void> => {
  const tokenValue = (token?.value || '').trim();
  if (!tokenValue) return;

  const previousUserId = safeStorage.get(TOKEN_OWNER_STORAGE_KEY);
  safeStorage.set(TOKEN_STORAGE_KEY, tokenValue);
  safeStorage.set(TOKEN_OWNER_STORAGE_KEY, userId);

  if (previousUserId && previousUserId !== userId) {
    try {
      await deleteDoc(doc(firestore, `users/${previousUserId}/deviceTokens/${tokenValue}`));
    } catch {
      // ignore previous owner cleanup failures
    }
  }

  try {
    await setDoc(
      doc(firestore, `users/${userId}/deviceTokens/${tokenValue}`),
      {
        token: tokenValue,
        platform: Capacitor.getPlatform(),
        updatedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp()
      },
      { merge: true }
    );
  } catch {
    // ignore token persistence failures
  }
};

const showForegroundNotification = async (notification: PushNotificationSchema): Promise<void> => {
  const title = notification.title || 'ScholarAxis';
  const body = notification.body || '';
  const extra = notification.data || {};

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 1000000),
          title,
          body,
          extra,
          channelId: ANDROID_CHANNEL_ID,
          sound: 'default'
        }
      ]
    });
  } catch {
    // ignore local notification failures
  }
};

export const initPushNotifications = async (options: PushInitOptions): Promise<() => void> => {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  await ensureAndroidChannel();

  try {
    await LocalNotifications.requestPermissions();
  } catch {
    // ignore permission failures for local notifications
  }

  const permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    const requested = await PushNotifications.requestPermissions();
    if (requested.receive !== 'granted') return () => undefined;
  } else if (permission.receive !== 'granted') {
    return () => undefined;
  }

  const registration = await PushNotifications.addListener('registration', token =>
    void persistToken(options.userId, token)
  );
  const registrationError = await PushNotifications.addListener('registrationError', error => {
    console.error('Push registration error', error);
  });
  const received = await PushNotifications.addListener('pushNotificationReceived', notification => {
    options.onForegroundNotification?.(notification);
    void showForegroundNotification(notification);
  });
  const actionPerformed = await PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action: ActionPerformed) => {
      const route = parseRouteFromData(action?.notification?.data as Record<string, unknown>);
      if (route) persistRoute(route);
    }
  );
  const localAction = await LocalNotifications.addListener('localNotificationActionPerformed', event => {
    const route = parseRouteFromData(event?.notification?.extra as Record<string, unknown>);
    if (route) persistRoute(route);
  });

  await PushNotifications.register();

  return () => {
    registration.remove();
    registrationError.remove();
    received.remove();
    actionPerformed.remove();
    localAction.remove();
  };
};

export const removeStoredPushToken = async (userId: string): Promise<void> => {
  const token = safeStorage.get(TOKEN_STORAGE_KEY);
  if (!token) return;

  safeStorage.remove(TOKEN_STORAGE_KEY);
  safeStorage.remove(TOKEN_OWNER_STORAGE_KEY);

  if (!Capacitor.isNativePlatform()) return;

  try {
    await deleteDoc(doc(firestore, `users/${userId}/deviceTokens/${token}`));
  } catch {
    // ignore delete failures
  }
};
