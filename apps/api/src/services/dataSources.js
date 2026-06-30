import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moenvGarbageRoutesFile = path.resolve(__dirname, '../../data/moenv-garbage-routes.json');

const cityAliases = {
  台北市: '臺北市',
  台中市: '臺中市',
  台南市: '臺南市',
  台東縣: '臺東縣',
  臺北市: '臺北市',
  臺中市: '臺中市',
  臺南市: '臺南市',
  臺東縣: '臺東縣'
};

const moduleEnvNames = {
  commute: 'COMMUTE',
  transit: 'TRANSIT',
  'road-incident': 'ROAD_INCIDENT',
  roadwork: 'ROADWORK',
  parking: 'PARKING',
  'garbage-truck': 'GARBAGE_TRUCK',
  'water-outage': 'WATER_OUTAGE',
  'power-outage': 'POWER_OUTAGE',
  'gas-work': 'GAS_WORK',
  'local-bulletin': 'LOCAL_BULLETIN',
  fire: 'FIRE',
  accident: 'ACCIDENT',
  'crime-watch': 'CRIME_WATCH',
  'fraud-alert': 'FRAUD_ALERT',
  evacuation: 'EVACUATION',
  bill: 'BILL',
  package: 'PACKAGE',
  calendar: 'CALENDAR',
  medicine: 'MEDICINE',
  chores: 'CHORES'
};

const tdxDefaults = {
  transit: 'https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/Alert',
  'road-incident': 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Incident/Freeway',
  roadwork: 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Construction/Freeway'
};

const publicDefaults = {
  'water-outage': 'https://web.water.gov.tw/wateroffapi/openData/export/json',
  'power-outage': 'https://portal2.emic.gov.tw/Pub/ERA2/OpenData/ERA2_E2.json'
};

const garbageTruckDefaults = {
  臺北市: 'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=a6e90031-7ec4-4089-afb5-361a4efe7202',
  台北市: 'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=a6e90031-7ec4-4089-afb5-361a4efe7202',
  新北市: 'https://data.ntpc.gov.tw/api/datasets/28ab4122-60e1-4065-98e5-abccb69aaca6/json?size=1000',
  臺中市: 'https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=68d1a87f-7baa-4b50-8408-c36a3a7eda68',
  台中市: 'https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=68d1a87f-7baa-4b50-8408-c36a3a7eda68',
  臺南市: 'https://soa.tainan.gov.tw/Api/Service/Get/2c8a70d5-06f2-4353-9e92-c40d33bcd969',
  台南市: 'https://soa.tainan.gov.tw/Api/Service/Get/2c8a70d5-06f2-4353-9e92-c40d33bcd969',
  宜蘭縣: 'https://opendata.ilepb.gov.tw/ILEPB04004?media=file',
  新竹市: 'https://7966.hccg.gov.tw/WEB/_IMP/API/CleanWeb/getCarLocation?rId=all',
  高雄市: 'https://api.kcg.gov.tw/api/service/Get/aaf4ce4b-4ca8-43de-bfaf-6dc97e89cac0'
};

const cityWideGarbageDefaults = new Set(['新竹市']);

let moenvGarbageRoutesCache = null;
let ncdrFeedCache = null;
let ncdrFeedLoadedAt = 0;

const ncdrEventNames = {
  rain: ['降雨'],
  temperature: ['高溫'],
  typhoon: ['颱風'],
  earthquake: ['地震'],
  'water-outage': ['停水'],
  evacuation: ['疏散', '避難', '土石流', '水庫放流'],
  accident: ['災害', '水庫放流', '道路封閉'],
  'local-bulletin': ['停水', '水庫放流', '降雨', '高溫', '地震', '颱風']
};

const taoyuanDistrictIds = {
  蘆竹區: 'lagi2-001',
  八德區: 'lagi2-002',
  桃園區: 'lagi2-003',
  中壢區: 'lagi2-004',
  平鎮區: 'lagi2-005',
  楊梅區: 'lagi2-006',
  大溪區: 'lagi2-007',
  大園區: 'lagi2-008',
  觀音區: 'lagi2-009',
  新屋區: 'lagi2-010',
  龜山區: 'lagi2-011',
  龍潭區: 'lagi2-012',
  復興區: 'lagi2-013'
};

const hinetRegionIds = {
  南投縣草屯鎮: '15',
  南投縣集集鎮: '21',
  彰化縣二水鄉: '27',
  彰化縣伸港鄉: '29',
  彰化縣彰化市: '12',
  彰化縣溪州鄉: '23',
  彰化縣田中鎮: '25',
  彰化縣田尾鄉: '31',
  彰化縣秀水鄉: '16',
  彰化縣芬園鄉: '20',
  澎湖縣白沙鄉: '33',
  澎湖縣馬公市: '28',
  臺東縣臺東市: '22',
  台東縣台東市: '22'
};

function canonicalCity(city = '') {
  return cityAliases[city] || city;
}

function displayCity(city = '') {
  return city.replace(/^臺/, '台');
}

function sameCity(a = '', b = '') {
  const left = canonicalCity(a);
  const right = canonicalCity(b);
  return left === right || left.includes(right) || right.includes(left);
}

function sourceUrlFor(moduleId) {
  const name = moduleEnvNames[moduleId];
  if (!name) return '';
  return process.env[`LOCAL_ALERT_SOURCE_${name}_URL`] || process.env[`${name}_SOURCE_URL`] || '';
}

function defaultSourceUrlFor(moduleId, location) {
  if (moduleId === 'garbage-truck') return garbageTruckDefaults[canonicalCity(location.city)] || garbageTruckDefaults[location.city] || '';
  return publicDefaults[moduleId] || '';
}

function readMoenvGarbageRoutes() {
  if (moenvGarbageRoutesCache) return moenvGarbageRoutesCache;
  try {
    moenvGarbageRoutesCache = JSON.parse(fs.readFileSync(moenvGarbageRoutesFile, 'utf8'));
  } catch {
    moenvGarbageRoutesCache = { routes: [] };
  }
  return moenvGarbageRoutesCache;
}

function moenvRouteFallback(location) {
  const routes = readMoenvGarbageRoutes().routes || [];
  const city = canonicalCity(location.city);
  const display = displayCity(city);
  const district = location.district || '';
  const matched = routes.find(route => sameCity(route.city, city) && (!district || route.district === district || route.district?.includes(district))) ||
    routes.find(route => sameCity(route.city, city));

  if (!matched) {
    return { status: 'not-configured', source: '資料源未設定' };
  }

  return {
    status: 'live',
    source: '環境部全國垃圾車清運路線查詢網',
    body: `${display}${matched.district || district}官方清運路線：${matched.routeName}（${matched.routeId}，${matched.method || '清運方式未標示'}）。`,
    shouldNotify: false
  };
}

function fieldValue(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`name="${escaped}"[^>]*value="([^"]*)"`))?.[1] || '';
}

function hinetRegionIdFor(location) {
  const city = canonicalCity(location.city);
  const district = location.district || '';
  return hinetRegionIds[`${city}${district}`] || hinetRegionIds[`${displayCity(city)}${district}`] || '';
}

function hinetCookieHeader(response) {
  return (response.headers.get('set-cookie') || '')
    .split(/,(?=[^ ;]+=)/)
    .map(cookie => cookie.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function hinetGarbage(location) {
  const regionId = hinetRegionIdFor(location);
  if (!regionId) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const page = await fetch('https://www.bstruck.hinet.net/Page/CarSearch.aspx', { signal: controller.signal });
    if (!page.ok) return null;
    const cookie = hinetCookieHeader(page);
    const html = await page.text();
    const form = new URLSearchParams({
      __VIEWSTATE: fieldValue(html, '__VIEWSTATE'),
      __VIEWSTATEGENERATOR: fieldValue(html, '__VIEWSTATEGENERATOR'),
      __EVENTVALIDATION: fieldValue(html, '__EVENTVALIDATION'),
      'ctl00$ContentPlaceHolder1$ddlRegion': regionId,
      'ctl00$ContentPlaceHolder1$tbRoadName': '',
      'ctl00$ContentPlaceHolder1$ImageButton1.x': '18',
      'ctl00$ContentPlaceHolder1$ImageButton1.y': '11'
    });
    const response = await fetch('https://www.bstruck.hinet.net/Page/CarSearch.aspx', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie
      },
      body: form
    });
    if (!response.ok) return null;
    const resultHtml = await response.text();
    if (resultHtml.includes('目前無執勤中的車輛')) return moenvRouteFallback(location);

    return {
      status: 'live',
      source: '清運e點通即時查詢',
      body: `${location.city}${location.district}清運e點通目前有執勤中車輛資料，請留意附近清運車動態。`,
      shouldNotify: false
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, { timeoutMs = 4500, headers = {}, method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers, method, body });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const parseLine = line => {
    const cells = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

async function fetchData(url, { timeoutMs = 4500, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) return null;
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return parseCsv(text);
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function xmlValue(xml, tag) {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]
    ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    ?.replace(/<[^>]+>/g, '')
    ?.trim() || '';
}

function xmlValues(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g'))]
    .map(match => match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
}

async function fetchNcdrFeed() {
  const now = Date.now();
  if (ncdrFeedCache && now - ncdrFeedLoadedAt < 180000) return ncdrFeedCache;
  const data = await fetchJson('https://alerts.ncdr.nat.gov.tw/JSONAtomFeed.ashx', { timeoutMs: 7000 });
  if (data?.entry) {
    ncdrFeedCache = Array.isArray(data.entry) ? data.entry : [data.entry];
    ncdrFeedLoadedAt = now;
  }
  return ncdrFeedCache || [];
}

function ncdrMatchesLocation(areas, location) {
  if (!areas.length) return true;
  const city = canonicalCity(location.city);
  const cityText = displayCity(city);
  const district = location.district || '';
  return areas.some(area => {
    const canonicalArea = canonicalCity(area);
    return canonicalArea.includes(city) || area.includes(cityText) || (district && area.includes(district));
  });
}

function isActiveCap(xml) {
  const msgType = xmlValue(xml, 'msgType');
  const expires = xmlValue(xml, 'expires');
  if (msgType === 'Cancel') return false;
  if (expires && new Date(expires).getTime() < Date.now()) return false;
  return true;
}

async function ncdrCapAlert(moduleId, location) {
  const names = ncdrEventNames[moduleId] || [];
  if (names.length === 0) return { status: 'not-configured', source: '資料源未設定' };
  const feed = await fetchNcdrFeed();
  const candidates = feed
    .filter(entry => names.some(name => `${entry.title || ''}${entry.id || ''}`.includes(name)))
    .slice(0, 40);

  for (const entry of candidates) {
    const href = entry.link?.['@href'] || entry.link?.href || entry.link;
    if (!href) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(href, { signal: controller.signal });
      if (!response.ok) continue;
      const xml = await response.text();
      if (!isActiveCap(xml)) continue;
      const areas = xmlValues(xml, 'areaDesc');
      if (!ncdrMatchesLocation(areas, location)) continue;
      const headline = xmlValue(xml, 'headline') || entry.title || '民生示警';
      const description = xmlValue(xml, 'description');
      const sender = xmlValue(xml, 'senderName') || entry.author?.name || 'NCDR';
      return {
        status: 'live',
        source: `NCDR 民生示警/${sender}`,
        body: `${headline}${description ? `：${description}` : ''}`,
        shouldNotify: ['rain', 'typhoon', 'earthquake', 'evacuation'].includes(moduleId)
      };
    } catch {
      // Keep scanning other CAP entries.
    } finally {
      clearTimeout(timer);
    }
  }

  return { status: 'no-event', source: 'NCDR 民生示警', body: `${location.city || '所在地'}${location.district || ''}目前沒有 ${moduleId} 民生示警。` };
}

function cookieHeaderFrom(response) {
  const setCookie = response.headers.get('set-cookie') || '';
  return setCookie
    .split(/,(?=[^ ;]+=)/)
    .map(cookie => cookie.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function postTaoyuanForm(cookie, body, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://route.tyoem.gov.tw/web/dataManagerAgentWeb.jsp', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: 'https://route.tyoem.gov.tw/',
        Cookie: cookie
      },
      body
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function taoyuanGarbage(location) {
  const districtId = taoyuanDistrictIds[location.district];
  if (!districtId) return { status: 'no-event', source: '桃園市垃圾清運路線即時查詢系統', body: `${location.district || '桃園市'}目前沒有可查詢的垃圾車行政區。` };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  let home;
  try {
    home = await fetch('https://route.tyoem.gov.tw/', { signal: controller.signal });
  } catch {
    return { status: 'no-event', source: '桃園市垃圾清運路線即時查詢系統', body: '桃園市垃圾車資料源目前無法連線。' };
  } finally {
    clearTimeout(timer);
  }
  if (!home.ok) return { status: 'no-event', source: '桃園市垃圾清運路線即時查詢系統', body: '桃園市垃圾車資料源目前無法連線。' };
  const cookie = cookieHeaderFrom(home);
  const html = await home.text();
  const randomForm = html.match(/id="random_form"[^>]+value="([^"]+)"/)?.[1];
  if (!randomForm || !cookie) return { status: 'no-event', source: '桃園市垃圾清運路線即時查詢系統', body: '桃園市垃圾車資料源目前無法建立查詢工作階段。' };

  const routes = await postTaoyuanForm(cookie, new URLSearchParams({
    dcfid: 'lagifQueryRouteByTown',
    gid: districtId,
    random_form: randomForm
  }));
  const routeItems = routes?.result || [];
  for (const route of routeItems.slice(0, 8)) {
    const realtime = await postTaoyuanForm(cookie, new URLSearchParams({
      dcfid: 'lagifQueryRealtimeByRoute',
      routing_id: route.routing_id,
      random_form: randomForm
    }));
    const vehicle = realtime?.result?.find(item => item.addr?.includes(location.district)) || realtime?.result?.[0];
    if (vehicle) {
      return {
        status: 'live',
        source: '桃園市垃圾清運路線即時查詢系統',
        body: [location.district, route.routing_name, vehicle.clean_status, vehicle.car_id, vehicle.addr].filter(Boolean).join('，'),
        shouldNotify: true
      };
    }
  }
  return { status: 'no-event', source: '桃園市垃圾清運路線即時查詢系統', body: `${location.city}${location.district}目前沒有垃圾車即時車輛資料。` };
}

async function fetchTdx(url) {
  const clientId = process.env.TDX_CLIENT_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { status: 'not-configured', source: 'TDX' };

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });
  const token = await fetchJson('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
    timeoutMs: 4500,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  return token?.access_token
    ? fetchJson(url, { headers: { Authorization: `Bearer ${token.access_token}` } })
    : null;
}

async function fetchCwaDatastore(datasetId, params = {}) {
  const key = process.env.CWA_API_KEY || process.env.CWB_API_KEY;
  if (!key) return { status: 'not-configured', source: 'CWA' };
  const search = new URLSearchParams({ Authorization: key, ...params });
  return fetchJson(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/${datasetId}?${search}`);
}

function weatherElements(data) {
  return data?.records?.location?.[0]?.weatherElement || [];
}

function firstParameter(elements, name) {
  return elements.find(entry => entry.elementName === name)?.time?.[0]?.parameter?.parameterName;
}

async function cwaForecast(rule, location) {
  const city = canonicalCity(location.city || '臺北市');
  const data = await fetchCwaDatastore('F-C0032-001', { locationName: city });
  if (data?.status === 'not-configured') return data;
  const elements = weatherElements(data);
  const rain = firstParameter(elements, 'PoP');
  const minT = firstParameter(elements, 'MinT');
  const maxT = firstParameter(elements, 'MaxT');
  const wx = firstParameter(elements, 'Wx');
  const place = `${displayCity(city)}${location.district || ''}`;

  if (rule.moduleId === 'rain' && rain) {
    return {
      status: 'live',
      source: 'CWA F-C0032-001',
      body: `${place}未來 12 小時降雨機率 ${rain}%，天氣${wx || '已更新'}。`,
      shouldNotify: Number(rain) >= Number(process.env.RAIN_NOTIFY_THRESHOLD || 50)
    };
  }

  if (rule.moduleId === 'temperature' && minT && maxT) {
    return {
      status: 'live',
      source: 'CWA F-C0032-001',
      body: `${place}未來 12 小時溫度約 ${minT}-${maxT} 度，天氣${wx || '已更新'}。`,
      shouldNotify: true
    };
  }

  return { status: 'no-event', source: 'CWA F-C0032-001', body: `${place}目前沒有可用的天氣預報資料。` };
}

async function cwaEarthquake(location) {
  const data = await fetchCwaDatastore('E-A0015-001', { limit: '1' });
  if (data?.status === 'not-configured') return data;
  const earthquake = data?.records?.Earthquake?.[0];
  const report = earthquake?.ReportContent || earthquake?.EarthquakeInfo?.Epicenter?.Location;
  const time = earthquake?.EarthquakeInfo?.OriginTime || earthquake?.EarthquakeNo;
  if (!report) return { status: 'no-event', source: 'CWA E-A0015-001', body: '目前沒有最新地震資料。' };
  return {
    status: 'live',
    source: 'CWA E-A0015-001',
    body: `最新地震資訊${time ? `（${time}）` : ''}：${report}`,
    shouldNotify: true
  };
}

async function cwaTyphoon(location) {
  const data = await fetchCwaDatastore('W-C0034-005');
  if (data?.status === 'not-configured') return data;
  const records = data?.records?.tropicalCyclones?.tropicalCyclone || data?.records?.TropicalCyclone || [];
  const items = Array.isArray(records) ? records : [records].filter(Boolean);
  if (items.length === 0) {
    return { status: 'no-event', source: 'CWA typhoon dataset', body: '目前沒有中央氣象署發布中的颱風資料。' };
  }
  const name = items[0]?.typhoonName || items[0]?.cwaTyphoonName || items[0]?.name || '颱風';
  return {
    status: 'live',
    source: 'CWA typhoon dataset',
    body: `中央氣象署目前有 ${name} 相關颱風資料，請留意最新路徑與警報。`,
    shouldNotify: true
  };
}

async function moenvAqi(location) {
  const key = process.env.MOENV_API_KEY || process.env.EPA_API_KEY;
  if (!key) return { status: 'not-configured', source: 'MOENV AQX_P_432' };
  const data = await fetchJson(`https://data.moenv.gov.tw/api/v2/aqx_p_432?api_key=${encodeURIComponent(key)}&format=json&limit=1000&sort=ImportDate%20desc`);
  const records = data?.records || [];
  const matched = records.find(record => sameCity(record.county, location.city)) || records[0];
  if (!matched?.aqi) return { status: 'no-event', source: 'MOENV AQX_P_432', body: `${location.city || '所在地'}目前沒有可用 AQI 資料。` };
  return {
    status: 'live',
    source: 'MOENV AQX_P_432',
    body: `${matched.county}${matched.sitename} AQI ${matched.aqi}，空氣品質 ${matched.status || '已更新'}，主要污染物 ${matched.pollutant || '無'}。`,
    shouldNotify: Number(matched.aqi) >= Number(process.env.AQI_NOTIFY_THRESHOLD || 100)
  };
}

function extractRecords(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data?.car)) return data.data.car;
  if (Array.isArray(data?.data)) return data.data;
  return data?.records || data?.data || data?.items || data?.detail || data?.result?.records || [];
}

function textFromRecord(record) {
  if (typeof record === 'string') return record;
  const title = record.title || record.Title || record.name || record.Name || record.subject || record.Subject || record.event || record.Event || record['案件類型'] || record['路線'] || record['路線名稱'] || record.routeName || record.task_type || record.linid;
  const area = record.area || record.Area || record.city || record.City || record.county || record.County || record.district || record.District || record['影響縣市'] || record['行政區'] || record['鄉鎮市'] || record.city_name || record.town_name || record.cityname || record.area;
  const time = record.time || record.Time || record.date || record.Date || record.startTime || record.StartTime || record.updateTime || record['案件日期時間'] || record['抵達時間'] || record['表定時間'] || record.rpt_time || record.fix_datetime_est || record.g_d1_time_s;
  const message = record.message || record.Message || record.description || record.Description || record.content || record.Content || record.memo || record.Memo || record['停水地區'] || record['停水原因'] || record['地點'] || record['清運點名稱'] || record.address || record.electro_dmg_area || record.business_lost_est || record.location || record.caption;
  const vehicle = record['車號'] || record.car || record.car_id || record.carNo;
  const endTime = record['離開時間'];
  const displayTime = endTime && time ? `${time}-${endTime}` : time;
  return [area, title, displayTime, vehicle, message].filter(Boolean).join('，');
}

function matchesLocation(record, location) {
  const haystack = JSON.stringify(record);
  return [location.city, canonicalCity(location.city), displayCity(canonicalCity(location.city)), location.district]
    .filter(Boolean)
    .some(term => haystack.includes(term));
}

function isEmptyEventRecord(record) {
  return record?.no_data_mark ||
    record?.electro_dmg_now === '0' ||
    record?.electro_dmg_area === '無' ||
    record?.['停水地區'] === '無';
}

async function genericConfiguredSource(rule, location) {
  const directUrl = sourceUrlFor(rule.moduleId);
  const publicUrl = defaultSourceUrlFor(rule.moduleId, location);
  const tdxUrl = tdxDefaults[rule.moduleId];
  if (!directUrl && !publicUrl && !tdxUrl) {
    if (rule.moduleId === 'garbage-truck') return moenvRouteFallback(location);
    return { status: 'not-configured', source: '資料源未設定' };
  }

  const source = directUrl ? '外部資料源' : publicUrl ? '政府公開資料' : 'TDX';
  const data = directUrl || publicUrl ? await fetchData(directUrl || publicUrl) : await fetchTdx(tdxUrl);
  if (data?.status === 'not-configured') return data;
  if (!data) {
    if (rule.moduleId === 'garbage-truck') return moenvRouteFallback(location);
    return { status: 'no-event', source, body: `${location.city || '所在地'}${location.district || ''}資料源暫時無法連線。` };
  }
  const records = extractRecords(data);
  const hasLocationScope = Boolean(location.city || location.district);
  const allowCityWideFallback = rule.moduleId === 'garbage-truck' && cityWideGarbageDefaults.has(canonicalCity(location.city));
  const matched = records.find(record => matchesLocation(record, location)) || (hasLocationScope && !allowCityWideFallback ? null : records.find(record => !isEmptyEventRecord(record)) || records[0]);
  if (!matched) {
    if (rule.moduleId === 'garbage-truck') return moenvRouteFallback(location);
    return { status: 'no-event', source, body: `${location.city || '所在地'}${location.district || ''}目前沒有 ${rule.moduleId} 即時事件。` };
  }
  if (isEmptyEventRecord(matched)) {
    return { status: 'no-event', source, body: `${location.city || '所在地'}${location.district || ''}目前沒有 ${rule.moduleId} 即時事件。` };
  }
  return {
    status: 'live',
    source,
    body: textFromRecord(matched) || `${location.city || '所在地'}${location.district || ''}有一筆 ${rule.moduleId} 即時資料。`,
    shouldNotify: true
  };
}

export async function resolveLiveAlert(rule, location) {
  if (rule.moduleId === 'rain' || rule.moduleId === 'temperature') {
    const result = await cwaForecast(rule, location);
    return result.status === 'not-configured' ? ncdrCapAlert(rule.moduleId, location) : result;
  }
  if (rule.moduleId === 'earthquake') {
    const result = await cwaEarthquake(location);
    return result.status === 'not-configured' ? ncdrCapAlert(rule.moduleId, location) : result;
  }
  if (rule.moduleId === 'typhoon') {
    const result = await cwaTyphoon(location);
    return result.status === 'not-configured' ? ncdrCapAlert(rule.moduleId, location) : result;
  }
  if (rule.moduleId === 'air-quality') return moenvAqi(location);
  if (rule.moduleId === 'garbage-truck' && canonicalCity(location.city) === '桃園市') return taoyuanGarbage(location);
  if (rule.moduleId === 'garbage-truck' && hinetRegionIdFor(location)) return (await hinetGarbage(location)) || moenvRouteFallback(location);
  if (['evacuation', 'local-bulletin', 'accident'].includes(rule.moduleId)) {
    const result = await ncdrCapAlert(rule.moduleId, location);
    if (result.status !== 'not-configured') return result;
  }
  return genericConfiguredSource(rule, location);
}

export function getSourceCoverage() {
  return {
    builtIn: {
      'water-outage': {
        coverage: '全台灣',
        source: publicDefaults['water-outage']
      },
      'power-outage': {
        coverage: '全台灣',
        source: publicDefaults['power-outage']
      },
      'garbage-truck': {
        coverage: [...Object.keys(garbageTruckDefaults), '桃園市'],
        sources: { ...garbageTruckDefaults, 桃園市: 'https://route.tyoem.gov.tw/' }
      },
      'garbage-route-schedule': {
        coverage: '全台灣 22 縣市清運路線 fallback',
        source: 'https://hwms.moenv.gov.tw/dispPageBox/route/routeCP.aspx?ddsPageID=ROUTE'
      },
      'hinet-garbage-realtime': {
        coverage: Object.keys(hinetRegionIds),
        source: 'https://www.bstruck.hinet.net/Page/CarSearch.aspx'
      },
      'ncdr-cap-alerts': {
        coverage: '全台灣民生示警 CAP',
        modules: ['rain', 'temperature', 'earthquake', 'typhoon', 'evacuation', 'local-bulletin', 'accident'],
        source: 'https://alerts.ncdr.nat.gov.tw/JSONAtomFeed.ashx'
      }
    },
    keyRequired: {
      cwa: ['rain', 'temperature', 'earthquake', 'typhoon'],
      moenv: ['air-quality'],
      tdx: ['transit', 'road-incident', 'roadwork']
    },
    configurable: Object.keys(moduleEnvNames).filter(moduleId => !publicDefaults[moduleId] && moduleId !== 'garbage-truck')
  };
}
