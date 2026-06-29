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

const sampleMessages = {
  rain: '今天傍晚降雨機率偏高，出門前記得帶傘。',
  temperature: '今日溫差較大，早晚外出請留意保暖與補水。',
  'air-quality': '空氣品質達普通偏差，敏感族群減少戶外活動。',
  earthquake: '近期地震資訊已更新，請確認緊急用品與避難路線。',
  typhoon: '颱風動態需要留意，請檢查陽台物品與防災用品。',
  commute: '通勤尖峰可能壅塞，建議提早出門或改走替代路線。',
  transit: '大眾運輸班次資訊已更新，出門前請再次確認。',
  'road-incident': '附近道路有事故資訊，請避開壅塞路段。',
  roadwork: '附近道路施工中，行車請留意改道。',
  parking: '目的地附近停車位偏滿，建議預留找車位時間。',
  'garbage-truck': '垃圾車預計 20 分鐘內抵達住家附近。',
  'water-outage': '所在區域有停水或降壓公告，請提前備水。',
  'power-outage': '所在區域有停電或維修公告，請留意用電安排。',
  'gas-work': '附近有瓦斯施工通知，請留意現場管制。',
  'local-bulletin': '所在地有新的市政公告可查看。',
  fire: '附近有火災或消防事件，請避開現場並留意安全。',
  accident: '附近有事故警示，請注意通行安全。',
  'crime-watch': '附近有治安提醒，夜間外出請提高警覺。',
  'fraud-alert': '有新的詐騙提醒，請留意可疑簡訊與電話。',
  evacuation: '避難資訊已更新，請確認最近避難地點。',
  bill: '本週有待繳帳單，建議今天先確認金額與期限。'
};

const sourceNames = {
  rain: 'CWA',
  temperature: 'CWA',
  'air-quality': 'MOENV',
  earthquake: 'CWA',
  typhoon: 'CWA',
  'garbage-truck': '市政資料',
  'water-outage': '市政資料',
  'power-outage': '台電/市政資料',
  'local-bulletin': '市政資料'
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

async function fetchJson(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getLiveBody(rule, location) {
  const cwaKey = process.env.CWA_API_KEY || process.env.CWB_API_KEY;
  const moenvKey = process.env.MOENV_API_KEY || process.env.EPA_API_KEY;

  if (cwaKey && (rule.moduleId === 'rain' || rule.moduleId === 'temperature')) {
    const data = await fetchJson(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=${encodeURIComponent(cwaKey)}&locationName=${encodeURIComponent(location.city)}`);
    const item = data?.records?.location?.[0]?.weatherElement || [];
    const rain = item.find(entry => entry.elementName === 'PoP')?.time?.[0]?.parameter?.parameterName;
    const minT = item.find(entry => entry.elementName === 'MinT')?.time?.[0]?.parameter?.parameterName;
    const maxT = item.find(entry => entry.elementName === 'MaxT')?.time?.[0]?.parameter?.parameterName;
    if (rule.moduleId === 'rain' && rain) return `${location.city}${location.district}未來 12 小時降雨機率 ${rain}%，出門前請留意雨具。`;
    if (rule.moduleId === 'temperature' && minT && maxT) return `${location.city}${location.district}溫度約 ${minT}-${maxT} 度，請依天氣調整穿著。`;
  }

  if (cwaKey && rule.moduleId === 'earthquake') {
    const data = await fetchJson(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/E-A0015-001?Authorization=${encodeURIComponent(cwaKey)}&limit=1`);
    const earthquake = data?.records?.Earthquake?.[0];
    const report = earthquake?.ReportContent || earthquake?.EarthquakeInfo?.Epicenter?.Location;
    if (report) return `最新地震資訊：${report}`;
  }

  if (moenvKey && rule.moduleId === 'air-quality') {
    const data = await fetchJson(`https://data.moenv.gov.tw/api/v2/aqx_p_432?api_key=${encodeURIComponent(moenvKey)}&format=json&limit=1000`);
    const records = data?.records || [];
    const matched = records.find(record => record.county === location.city || location.city.includes(record.county));
    if (matched?.aqi) return `${matched.county}${matched.sitename} AQI ${matched.aqi}，空氣品質 ${matched.status || '已更新'}。`;
  }

  return null;
}

export async function buildAlerts(state, reason = 'manual', deviceId = 'demo') {
  const now = new Date();
  const enabledRules = state.rules.filter(rule => rule.ownerDeviceId === deviceId && rule.enabled);
  const locations = state.locations.filter(location => location.ownerDeviceId === deviceId);
  const primaryLocation = locations[0] || { id: 'home', city: '台北市', district: '信義區' };

  const alerts = [];
  for (const rule of enabledRules) {
    const silenced = reason === 'scheduled' && rule.severity !== 'critical' && isWithinQuietHours(rule, now);
    const liveBody = await getLiveBody(rule, primaryLocation);
    alerts.push({
      id: `${deviceId}:${rule.id}:${now.getTime()}`,
      ownerDeviceId: deviceId,
      categoryId: rule.categoryId,
      moduleId: rule.moduleId,
      title: moduleLabels[rule.moduleId] || rule.moduleId,
      body: liveBody || sampleMessages[rule.moduleId] || `${moduleLabels[rule.moduleId] || rule.moduleId} 有新的在地資訊需要確認。`,
      severity: rule.severity,
      locationId: primaryLocation.id,
      locationName: `${primaryLocation.city || ''}${primaryLocation.district || ''}`,
      source: liveBody ? (sourceNames[rule.moduleId] || '即時資料') : '系統範例',
      read: false,
      archived: false,
      silenced,
      createdAt: now.toISOString(),
      reason
    });
  }
  return alerts;
}
