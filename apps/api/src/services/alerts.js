import { resolveLiveAlert } from './dataSources.js';

const moduleLabels = {
  rain: '降雨提醒',
  temperature: '溫度提醒',
  'air-quality': '空氣品質',
  earthquake: '地震提醒',
  typhoon: '颱風警戒',
  commute: '通勤路況',
  transit: '大眾運輸',
  'road-incident': '道路事故',
  roadwork: '道路施工',
  parking: '停車提醒',
  'garbage-truck': '垃圾車',
  'water-outage': '停水提醒',
  'power-outage': '停電提醒',
  'gas-work': '瓦斯施工',
  'local-bulletin': '市政公告',
  fire: '火災警示',
  accident: '事故警示',
  'crime-watch': '治安提醒',
  'fraud-alert': '詐騙提醒',
  evacuation: '避難資訊',
  bill: '帳單提醒',
  package: '包裹提醒',
  calendar: '行事曆',
  medicine: '藥物提醒',
  chores: '家務提醒'
};

function isWithinQuietHours(rule, now = new Date()) {
  if (!rule.quietHours?.start || !rule.quietHours?.end) return false;
  const [startHour, startMinute] = rule.quietHours.start.split(':').map(Number);
  const [endHour, endMinute] = rule.quietHours.end.split(':').map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function notConfiguredMessage(rule, location) {
  return `${location.city || '所在地'}${location.district || ''}的「${moduleLabels[rule.moduleId] || rule.moduleId}」尚未設定正式資料源，未產生真實提醒。`;
}

export async function buildAlerts(state, reason = 'manual', deviceId = 'demo') {
  const now = new Date();
  const enabledRules = state.rules.filter(rule => rule.ownerDeviceId === deviceId && rule.enabled);
  const locations = state.locations.filter(location => location.ownerDeviceId === deviceId);
  const primaryLocation = locations[0] || { id: 'home', city: '台北市', district: '信義區' };

  const alerts = [];
  for (const rule of enabledRules) {
    const live = await resolveLiveAlert(rule, primaryLocation);
    const hasNotifyEvent = live?.status === 'live' && live.shouldNotify !== false;
    if (reason === 'scheduled' && !hasNotifyEvent) continue;
    const silenced = !hasNotifyEvent || (reason === 'scheduled' && rule.severity !== 'critical' && isWithinQuietHours(rule, now));
    alerts.push({
      id: `${deviceId}:${rule.id}:${now.getTime()}`,
      ownerDeviceId: deviceId,
      categoryId: rule.categoryId,
      moduleId: rule.moduleId,
      title: moduleLabels[rule.moduleId] || rule.moduleId,
      body: live?.body || notConfiguredMessage(rule, primaryLocation),
      severity: rule.severity,
      locationId: primaryLocation.id,
      locationName: `${primaryLocation.city || ''}${primaryLocation.district || ''}`,
      source: live?.source || '資料源未設定',
      dataStatus: live?.status || 'not-configured',
      read: false,
      archived: false,
      silenced,
      createdAt: now.toISOString(),
      reason
    });
  }
  return alerts;
}
