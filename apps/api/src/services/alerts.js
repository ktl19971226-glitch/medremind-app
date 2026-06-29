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
  'air-quality': '空氣品質達普通偏差，敏感族群減少戶外活動。',
  earthquake: '近期地震資訊已更新，請確認緊急用品與避難路線。',
  'garbage-truck': '垃圾車預計 20 分鐘內抵達住家附近。',
  bill: '本週有待繳帳單，建議今天先確認金額與期限。'
};

export function buildAlerts(state, reason = 'manual') {
  const now = new Date();
  const enabledRules = state.rules.filter(rule => rule.enabled);
  return enabledRules.map(rule => ({
    id: `${rule.id}:${now.getTime()}`,
    categoryId: rule.categoryId,
    moduleId: rule.moduleId,
    title: moduleLabels[rule.moduleId] || rule.moduleId,
    body: sampleMessages[rule.moduleId] || `${moduleLabels[rule.moduleId] || rule.moduleId} 有新的在地資訊需要確認。`,
    severity: rule.severity,
    locationId: state.locations[0]?.id || 'home',
    createdAt: now.toISOString(),
    reason
  }));
}
