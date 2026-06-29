export const categories = [
  {
    id: 'environment',
    name: '天氣環境',
    description: '雨勢、高低溫、空氣品質、地震與災害警戒',
    modules: ['rain', 'temperature', 'air-quality', 'earthquake', 'typhoon']
  },
  {
    id: 'mobility',
    name: '交通移動',
    description: '通勤路線、公共運輸、道路事故、施工與停車',
    modules: ['commute', 'transit', 'road-incident', 'roadwork', 'parking']
  },
  {
    id: 'civic',
    name: '生活市政',
    description: '垃圾車、停水停電、瓦斯施工、里民與市府公告',
    modules: ['garbage-truck', 'water-outage', 'power-outage', 'gas-work', 'local-bulletin']
  },
  {
    id: 'safety',
    name: '安全警示',
    description: '火災、事故、治安熱點、詐騙與避難資訊',
    modules: ['fire', 'accident', 'crime-watch', 'fraud-alert', 'evacuation']
  },
  {
    id: 'personal',
    name: '個人生活',
    description: '帳單、包裹、行事曆、藥物、保養與家務',
    modules: ['bill', 'package', 'calendar', 'medicine', 'chores']
  }
];

export const defaultRules = categories.flatMap(category =>
  category.modules.map(moduleId => ({
    id: `${category.id}:${moduleId}`,
    categoryId: category.id,
    moduleId,
    enabled: ['rain', 'air-quality', 'earthquake', 'garbage-truck', 'bill'].includes(moduleId),
    severity: moduleId === 'earthquake' || moduleId === 'fire' ? 'critical' : 'normal',
    quietHours: { start: '23:00', end: '08:00' }
  }))
);
