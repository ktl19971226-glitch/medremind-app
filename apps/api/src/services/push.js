import { Expo } from 'expo-server-sdk';

const expo = new Expo();

export async function sendPush(devices, alert) {
  const messages = devices
    .filter(device => Expo.isExpoPushToken(device.pushToken))
    .map(device => ({
      to: device.pushToken,
      sound: 'default',
      title: alert.title,
      body: alert.body,
      data: { alertId: alert.id, categoryId: alert.categoryId, moduleId: alert.moduleId }
    }));

  if (messages.length === 0) {
    return { sent: 0, tickets: [] };
  }

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];
  for (const chunk of chunks) {
    tickets.push(...await expo.sendPushNotificationsAsync(chunk));
  }
  return { sent: messages.length, tickets };
}
