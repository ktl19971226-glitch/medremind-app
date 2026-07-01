import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moenvGarbageRoutesFile = path.resolve(__dirname, '../../data/moenv-garbage-routes.json');
const freewayLiveEventsFile = path.resolve(__dirname, '../../data/freeway-live-events.xml');
const fraudDashboardFile = path.resolve(__dirname, '../../data/fraud-dashboard.json');
const tainanParkingFile = path.resolve(__dirname, '../../data/tainan-parking.json');
const kaohsiungParkingFile = path.resolve(__dirname, '../../data/kaohsiung-parking.json');
const yilanParkingFile = path.resolve(__dirname, '../../data/yilan-parking.json');
const tainanRoadworkFile = path.resolve(__dirname, '../../data/tainan-roadwork.xml');
const kaohsiungRoadworkFile = path.resolve(__dirname, '../../data/kaohsiung-roadwork.xml');
const nantouRoadworkFile = path.resolve(__dirname, '../../data/nantou-roadwork.json');
const yunlinRoadworkFile = path.resolve(__dirname, '../../data/yunlin-roadwork.json');
const pingtungRoadworkFile = path.resolve(__dirname, '../../data/pingtung-roadwork.xml');
const yilanRoadworkFile = path.resolve(__dirname, '../../data/yilan-roadwork.xml');
const nfaFireInfoUrl = 'https://www.nfa.gov.tw/cht/index.php?code=list&ids=22';

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
  'power-outage': 'https://portal2.emic.gov.tw/Pub/ERA2/OpenData/ERA2_E2.json',
  'gas-work': 'https://www.moeaea.gov.tw/ECW/populace/opendata/wHandOpenData_File.ashx?set_id=168'
};

const npaWomenSafetyUrl = 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/DBB18796-8A89-4917-B4AB-D0AF26FAFEDC/resource/ADD554F1-FE8C-422C-8ACE-1E560D119E2A/download';
const npaFatalTrafficAccidentUrl = 'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/F4077949-50CC-4640-8114-79958CC8BBEA/resource/A07568BF-83F7-4A55-9B8D-3638A0B22271/download';
const cwaTownForecastBaseUrl = 'https://opendata.cwa.gov.tw/fileapi/v1/opendataapi';
const cwaPublicFileKey = 'rdec-key-123-45678-011121314';

const cwaTownForecastDatasetIds = {
  宜蘭縣: 'F-D0047-001',
  桃園市: 'F-D0047-005',
  新竹縣: 'F-D0047-009',
  苗栗縣: 'F-D0047-013',
  彰化縣: 'F-D0047-017',
  南投縣: 'F-D0047-021',
  雲林縣: 'F-D0047-025',
  嘉義縣: 'F-D0047-029',
  屏東縣: 'F-D0047-033',
  臺東縣: 'F-D0047-037',
  花蓮縣: 'F-D0047-041',
  澎湖縣: 'F-D0047-045',
  基隆市: 'F-D0047-049',
  新竹市: 'F-D0047-053',
  嘉義市: 'F-D0047-057',
  臺北市: 'F-D0047-061',
  高雄市: 'F-D0047-065',
  新北市: 'F-D0047-069',
  臺中市: 'F-D0047-073',
  臺南市: 'F-D0047-077',
  連江縣: 'F-D0047-081',
  金門縣: 'F-D0047-085'
};

const parkingDefaults = {
  基隆市: {
    availability: 'https://e-traffic.klcg.gov.tw/KeelungTraffic/pages/park.jsp/'
  },
  新竹市: {
    availability: 'https://opendata.hccg.gov.tw/OpenDataFileHit.ashx?ID=8C730C34537B3B30&u=77DFE16E459DFCE34D11875AA33778DC718F99245062BA928D228BF51D8CC6D584EFAF5624D84DF6907C00E07EEC7BD43F5EF012E8D2D67A89054F094451DB04',
    info: 'https://hispark.hccg.gov.tw/',
    label: '新竹市停車服務資訊',
    summary: '提供新竹市停車費查詢與收費路段資訊；剩餘車位 JSON 若暫時無法連線，先以官方停車服務入口補底。'
  },
  彰化縣: {
    availability: 'https://chpark.chcg.gov.tw/ParkingLocation/SmartParkingFacilitiesPost'
  },
  嘉義市: {
    availability: 'https://iparking.chiayi.gov.tw/car/open'
  },
  臺北市: {
    availability: 'https://tcgbusfs.blob.core.windows.net/blobtcmsv/TCMSV_allavailable.json',
    details: 'https://tcgbusfs.blob.core.windows.net/blobtcmsv/TCMSV_alldesc.json'
  },
  台北市: {
    availability: 'https://tcgbusfs.blob.core.windows.net/blobtcmsv/TCMSV_allavailable.json',
    details: 'https://tcgbusfs.blob.core.windows.net/blobtcmsv/TCMSV_alldesc.json'
  },
  新北市: {
    availability: 'https://data.ntpc.gov.tw/api/datasets/e09b35a5-a738-48cc-b0f5-570b67ad9c78/json?size=2000',
    details: 'https://data.ntpc.gov.tw/api/datasets/b1464ef0-9c7c-4a6f-abf7-6bdf32847e68/json?size=2000'
  },
  桃園市: {
    availability: 'https://opendata.tycg.gov.tw/api/dataset/f4cc0b12-86ac-40f9-8745-885bddc18f79/resource/0381e141-f7ee-450e-99da-2240208d1773/download'
  },
  臺中市: {
    availability: 'https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=4f9c4d26-d826-4277-8f8a-6d2469fe9653'
  },
  台中市: {
    availability: 'https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=4f9c4d26-d826-4277-8f8a-6d2469fe9653'
  },
  臺南市: {
    availability: 'https://soa.tainan.gov.tw/Api/Service/Get/91073f40-d251-42cc-9f4c-88e8937c9911'
  },
  台南市: {
    availability: 'https://soa.tainan.gov.tw/Api/Service/Get/91073f40-d251-42cc-9f4c-88e8937c9911'
  },
  高雄市: {
    availability: 'https://kpp.tbkc.gov.tw/ParkingLocation/ParkingLotPost'
  },
  宜蘭縣: {
    availability: 'https://opendataap2.e-land.gov.tw/resource/files/2023-02-12/62f4d78b604ba16b8cc1e856dd28d2c3.json'
  },
  新竹縣: {
    info: 'https://hcpark.hchg.gov.tw/web/Parking',
    label: '新竹縣政府路邊停車中心',
    summary: '提供停車場查詢、停車費查詢與收費公告；目前未公開穩定即時剩餘車位 API。'
  },
  苗栗縣: {
    info: 'https://miaoliparking.jotangi.com.tw/',
    label: '苗栗縣政府停車服務資訊',
    summary: '提供停車費查詢、收費路段與停車服務資訊；目前未公開穩定即時剩餘車位 API。'
  },
  南投縣: {
    info: 'https://parking.nantou.gov.tw/ParkingLocation',
    label: '南投縣政府停車服務資訊',
    summary: '提供停車地圖、停車費查詢、南投/集集/埔里/草屯等收費公告；目前未公開穩定即時剩餘車位 API。'
  },
  雲林縣: {
    availability: 'https://www.opendata.vip/tdx/parking/YunlinCounty'
  },
  嘉義縣: {
    info: 'https://www.greenparking.com.tw/Chiayi',
    label: '嘉義縣路邊停車管理',
    summary: '提供嘉義縣政府周邊路邊停車格、收費時間與費率資訊；目前未公開穩定即時剩餘車位 API。'
  },
  屏東縣: {
    availability: 'https://www.opendata.vip/tdx/parking/PingtungCounty'
  },
  花蓮縣: {
    availability: 'https://www.opendata.vip/tdx/parking/HualienCounty'
  },
  臺東縣: {
    info: 'https://taitung.hfpark.tw/Web/Pages/Business/Parking',
    label: '臺東縣停車資訊網停車場車位表',
    summary: '提供臺東縣停車場車位表與停車費查詢；目前未公開穩定即時剩餘車位 API。'
  },
  澎湖縣: {
    info: 'https://peh.guoyun.com.tw/ParkQuery/',
    label: '澎湖縣停車資料即時查詢',
    summary: '提供澎湖縣停車查詢與停車服務入口；目前未公開穩定即時剩餘車位 API。'
  },
  金門縣: {
    availability: 'https://www.opendata.vip/tdx/parking/KinmenCounty'
  },
  連江縣: {
    availability: 'https://parking.matsu.gov.tw/apis/parking-lots/lots',
    spaces: 'https://parking.matsu.gov.tw/apis/parking-lots/availablespaces/0'
  }
};

const fireDefaults = {
  臺北市: 'https://service119.tfd.gov.tw/service119/citizenCase/caseList',
  台北市: 'https://service119.tfd.gov.tw/service119/citizenCase/caseList',
  基隆市: 'https://www.klfd.klcg.gov.tw/tw/klfd1/4243.html',
  新竹市: 'https://119.hccg.gov.tw/chhcfd/app/data/list?id=86',
  新竹縣: 'https://fire.hsinchu.gov.tw/cht/index.php?code=list&ids=262',
  新北市: 'https://e.ntpc.gov.tw/v3/api/map/dynamic/layer/rescue',
  桃園市: 'https://www.tyfd.gov.tw/cht/index.php?act=caselist',
  臺中市: 'https://www.fire.taichung.gov.tw/',
  臺南市: 'https://119dts.tncfd.gov.tw/DTS/caselist/html',
  苗栗縣: 'https://119mlfire.mlfd.gov.tw/DTS/caselist/html',
  彰化縣: 'https://www.chfd.gov.tw/RealInfo/index.aspx?Parser=99,3,29',
  南投縣: 'https://www.ntfd.gov.tw/index.php?act=caselist',
  雲林縣: nfaFireInfoUrl,
  嘉義縣: 'https://cycfb.cyhg.gov.tw/DisasterPrevent.aspx?n=5F10482409025004&sms=ED4E0CDDC2EA92E6',
  嘉義市: 'https://cyfd.chiayi.gov.tw/Common/Getfdcaselist.ashx?mode=Page',
  高雄市: 'https://119dts.fdkc.gov.tw/DTS/caselist/html',
  宜蘭縣: 'https://61.60.54.30/DTS/caselist/html',
  屏東縣: 'https://pteoc.pthg.gov.tw/News119',
  花蓮縣: nfaFireInfoUrl,
  臺東縣: nfaFireInfoUrl,
  澎湖縣: 'http://210.241.42.144:8080/DTS/caselist/html',
  金門縣: nfaFireInfoUrl,
  連江縣: nfaFireInfoUrl
};

const transitDefaults = {
  臺北市: 'https://web.metro.taipei/pages2026/WebServiceStatus',
  台北市: 'https://web.metro.taipei/pages2026/WebServiceStatus',
  新北市: 'https://web.metro.taipei/pages2026/WebServiceStatus'
};

const localBulletinDefaults = {
  臺北市: { info: 'https://www.gov.taipei/', label: '臺北市政府市政資訊', summary: '臺北市政府官方入口，提供市政新聞、公告、活動與各局處訊息。' },
  台北市: { info: 'https://www.gov.taipei/', label: '臺北市政府市政資訊', summary: '臺北市政府官方入口，提供市政新聞、公告、活動與各局處訊息。' },
  新北市: { info: 'https://www.ntpc.gov.tw/', label: '新北市政府市政資訊', summary: '新北市政府官方入口，提供市政新聞、公告、活動與各局處訊息。' },
  桃園市: { info: 'https://www.tycg.gov.tw/', label: '桃園市政府市政資訊', summary: '桃園市政府官方入口，提供市政新聞、公告、活動與各局處訊息。' },
  臺中市: { info: 'https://www.taichung.gov.tw/', label: '臺中市政府市政資訊', summary: '臺中市政府官方入口，提供市政新聞、市政公告、活動與各局處訊息。' },
  台中市: { info: 'https://www.taichung.gov.tw/', label: '臺中市政府市政資訊', summary: '臺中市政府官方入口，提供市政新聞、市政公告、活動與各局處訊息。' },
  臺南市: { info: 'https://www.tainan.gov.tw/', label: '臺南市政府市政資訊', summary: '臺南市政府官方入口，提供市政新聞、市政公告、活動與各局處訊息。' },
  台南市: { info: 'https://www.tainan.gov.tw/', label: '臺南市政府市政資訊', summary: '臺南市政府官方入口，提供市政新聞、市政公告、活動與各局處訊息。' },
  高雄市: { info: 'https://www.kcg.gov.tw/', label: '高雄市政府市政資訊', summary: '高雄市政府官方入口，提供市政新聞、公告、活動與各局處訊息。' },
  基隆市: { info: 'https://www.klcg.gov.tw/', label: '基隆市政府市政資訊', summary: '基隆市政府官方入口，提供市政新聞、公告、活動與各局處訊息。' },
  新竹市: { info: 'https://www.hccg.gov.tw/', label: '新竹市政府市政資訊', summary: '新竹市政府官方入口，提供市政新聞、公告、活動與各局處訊息。' },
  新竹縣: { info: 'https://www.hsinchu.gov.tw/', label: '新竹縣政府縣政資訊', summary: '新竹縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  苗栗縣: { info: 'https://www.miaoli.gov.tw/', label: '苗栗縣政府縣政資訊', summary: '苗栗縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  彰化縣: { info: 'https://www.chcg.gov.tw/', label: '彰化縣政府縣政資訊', summary: '彰化縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  南投縣: { info: 'https://www.nantou.gov.tw/', label: '南投縣政府縣政資訊', summary: '南投縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  雲林縣: { info: 'https://www.yunlin.gov.tw/', label: '雲林縣政府縣政資訊', summary: '雲林縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  嘉義縣: { info: 'https://www.cyhg.gov.tw/', label: '嘉義縣政府縣政資訊', summary: '嘉義縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  嘉義市: { info: 'https://www.chiayi.gov.tw/', label: '嘉義市政府市政資訊', summary: '嘉義市政府官方入口，提供市政新聞、公告、活動與各局處訊息。' },
  屏東縣: { info: 'https://www.pthg.gov.tw/', label: '屏東縣政府縣政資訊', summary: '屏東縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  宜蘭縣: { info: 'https://www.e-land.gov.tw/', label: '宜蘭縣政府縣政資訊', summary: '宜蘭縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  花蓮縣: { info: 'https://www.hl.gov.tw/', label: '花蓮縣政府縣政資訊', summary: '花蓮縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  臺東縣: { info: 'https://www.taitung.gov.tw/', label: '臺東縣政府縣政資訊', summary: '臺東縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  台東縣: { info: 'https://www.taitung.gov.tw/', label: '臺東縣政府縣政資訊', summary: '臺東縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  澎湖縣: { info: 'https://www.penghu.gov.tw/', label: '澎湖縣政府縣政資訊', summary: '澎湖縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  金門縣: { info: 'https://www.kinmen.gov.tw/', label: '金門縣政府縣政資訊', summary: '金門縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' },
  連江縣: { info: 'https://www.matsu.gov.tw/', label: '連江縣政府縣政資訊', summary: '連江縣政府官方入口，提供縣政新聞、公告、活動與各局處訊息。' }
};

const thsrStatusUrl = 'https://www.thsrc.com.tw/ArticleContent/3ec1c04f-d3de-45b1-becc-cba412d55123';
const traLiveBoardPublicUrl = 'https://ptx.transportdata.tw/MOTC/v2/Rail/TRA/LiveBoard?$top=500&$format=JSON';
const ptxBusAlertBaseUrl = 'https://ptx.transportdata.tw/MOTC/v2/Bus/Alert';
const taipeiTodayRoadworkUrl = 'https://tpnco.blob.core.windows.net/blobfs/Todaywork.json';
const newTaipeiRoadworkUrl = 'https://data.ntpc.gov.tw/api/datasets/96B6101B-C033-4834-8BD5-E312651DB7A0/json?page=0&size=1000';
const taoyuanTodayRoadworkUrl = 'https://opendata.tycg.gov.tw/api/dataset/56c616fe-07d7-4b0c-bb75-e8f8cd75500a/resource/52de3762-1490-4a86-a074-0062d746873b/download';
const tainanTodayRoadworkUrl = 'https://diggis.tainan.gov.tw/TNRoad/ashx/PresentDayCase.ashx';
const kaohsiungRoadworkUrl = 'https://pipegis.kcg.gov.tw/openDataService.aspx';
const nantouRoadworkBaseUrl = 'https://pipeline.nantou.gov.tw/Public';
const yunlinRoadworkBaseUrl = 'https://pwd.yunlin.gov.tw/YLPub';
const pingtungRoadworkUrl = 'https://e-road.pthg.gov.tw/openDataService.aspx';
const kinmenApprovedRoadworkBaseUrl = 'https://roaddig.kinmen.gov.tw/KMDigAPI/api/OpenData/GetApprovedCaseList';
const yilanRoadworkUrl = 'https://mntengmgt.e-land.gov.tw/YilanDigweb/Download/XML/dig.xml';
const taoyuanMetroStatusUrl = 'https://www.tymetro.com.tw/tymetro-new/tw/index.php';
const taichungMetroStatusUrl = 'https://www.tmrt.com.tw/';
const kaohsiungMetroNoticeUrl = 'https://www.krtc.com.tw/Information/notice';

const tdxCityCodes = {
  臺北市: 'Taipei',
  台北市: 'Taipei',
  新北市: 'NewTaipei',
  桃園市: 'Taoyuan',
  臺中市: 'Taichung',
  台中市: 'Taichung',
  臺南市: 'Tainan',
  台南市: 'Tainan',
  高雄市: 'Kaohsiung',
  基隆市: 'Keelung',
  新竹市: 'Hsinchu',
  新竹縣: 'HsinchuCounty',
  苗栗縣: 'MiaoliCounty',
  彰化縣: 'ChanghuaCounty',
  南投縣: 'NantouCounty',
  雲林縣: 'YunlinCounty',
  嘉義縣: 'ChiayiCounty',
  嘉義市: 'Chiayi',
  屏東縣: 'PingtungCounty',
  宜蘭縣: 'YilanCounty',
  花蓮縣: 'HualienCounty',
  臺東縣: 'TaitungCounty',
  台東縣: 'TaitungCounty',
  澎湖縣: 'PenghuCounty',
  金門縣: 'KinmenCounty',
  連江縣: 'LienchiangCounty'
};

const tdxCitySourceNames = Object.fromEntries(
  Object.entries(tdxCityCodes).map(([city, code]) => [canonicalCity(city), code])
);

const fraudDashboardDefaults = {
  newsTicker: 'https://165dashboard.tw/CIB_DWS_API/api/NewsTicker/GetNewsTicker',
  methods: 'https://165dashboard.tw/CIB_DWS_API/api/FraudMethod/GetTodayFraudMethodList',
  advocacy: 'https://165dashboard.tw/CIB_DWS_API/api/PreventionAdvocacy/GetPreventionAdvocacyList'
};

const moenvPublicAqiKeys = [
  '4c89a32a-a214-461b-bf29-30ff32a61a8a',
  'e75b1660-e564-4107-aad5-a8be1f905dd9',
  'b7df779e-71a6-4148-8379-5afbd441d803'
];

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
let fraudDashboardCache = null;
let tainanParkingCache = null;
let kaohsiungParkingCache = null;
let yilanParkingCache = null;
let tdxTokenCache = null;
let cwaTownForecastCache = {};
let cwaPublicFileCache = {};

const ncdrEventNames = {
  rain: ['降雨'],
  temperature: ['高溫'],
  typhoon: ['颱風'],
  earthquake: ['地震'],
  transit: ['臺鐵', '台鐵', '鐵路', '營運警示', '停駛'],
  'water-outage': ['停水'],
  evacuation: ['疏散', '避難', '土石流', '水庫放流'],
  accident: ['災害', '水庫放流', '道路封閉'],
  'local-bulletin': ['停水', '水庫放流', '降雨', '高溫', '地震', '颱風']
};

const ncdrDisplayNames = {
  rain: '降雨',
  temperature: '高溫',
  typhoon: '颱風',
  earthquake: '地震',
  transit: '臺鐵營運異常',
  'water-outage': '停水',
  evacuation: '疏散避難',
  accident: '事故警戒',
  'local-bulletin': '民生公告'
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

function tdxCityCodeFor(location) {
  return tdxCitySourceNames[canonicalCity(location.city)] || tdxCityCodes[location.city] || '';
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

function readFraudDashboardFallback() {
  if (fraudDashboardCache) return fraudDashboardCache;
  try {
    fraudDashboardCache = JSON.parse(fs.readFileSync(fraudDashboardFile, 'utf8'));
  } catch {
    fraudDashboardCache = { data: {} };
  }
  return fraudDashboardCache;
}

function readTainanParkingFallback() {
  if (tainanParkingCache) return tainanParkingCache;
  try {
    tainanParkingCache = JSON.parse(fs.readFileSync(tainanParkingFile, 'utf8'));
  } catch {
    tainanParkingCache = { data: [] };
  }
  return tainanParkingCache;
}

function readKaohsiungParkingFallback() {
  if (kaohsiungParkingCache) return kaohsiungParkingCache;
  try {
    kaohsiungParkingCache = JSON.parse(fs.readFileSync(kaohsiungParkingFile, 'utf8'));
  } catch {
    kaohsiungParkingCache = { parkingLots: [] };
  }
  return kaohsiungParkingCache;
}

function readYilanParkingFallback() {
  if (yilanParkingCache) return yilanParkingCache;
  try {
    yilanParkingCache = JSON.parse(fs.readFileSync(yilanParkingFile, 'utf8'));
  } catch {
    yilanParkingCache = [];
  }
  return yilanParkingCache;
}

function readTextFallback(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readJsonFallback(filePath, fallbackValue = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallbackValue;
  }
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

async function fetchText(url, { timeoutMs = 4500, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) return '';
    return response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextAllowInvalidCert(url, { timeoutMs = 4500, headers = {} } = {}) {
  return new Promise(resolve => {
    let settled = false;
    const done = value => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const request = https.get(url, { headers, rejectUnauthorized: false }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        fetchTextAllowInvalidCert(new URL(response.headers.location, url).toString(), { timeoutMs, headers }).then(done);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        done('');
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
      });
      response.on('end', () => done(body));
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      done('');
    });
    request.on('error', () => done(''));
  });
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

function xmlBlocks(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g'))].map(match => match[1]);
}

function distanceKm(aLat, aLng, bLat, bLng) {
  const toRad = degree => degree * Math.PI / 180;
  const earthRadius = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointFromWkt(wkt = '') {
  const match = wkt.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
  return match ? { lng: Number(match[1]), lat: Number(match[2]) } : null;
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

  return { status: 'no-event', source: 'NCDR 民生示警', body: `${location.city || '所在地'}${location.district || ''}目前沒有 ${ncdrDisplayNames[moduleId] || moduleId} 民生示警。` };
}

async function freewayLiveEvent(rule, location) {
  let text = await fetchText('https://tisvcloud.freeway.gov.tw/history/motc20/LiveEvents.xml', { timeoutMs: 7000 });
  if (!text) {
    try {
      text = fs.readFileSync(freewayLiveEventsFile, 'utf8');
    } catch {
      text = '';
    }
  }
  if (!text) return { status: 'no-event', source: '高速公路局 TISVCloud', body: '國道路況事件資料源暫時無法連線。' };
  const wantedTypes = rule.moduleId === 'roadwork'
    ? new Set(['2'])
    : rule.moduleId === 'road-incident'
      ? new Set(['1', '3', '4', '5', '6', '8'])
      : new Set(['1', '2', '3', '4', '5', '6', '8']);
  const events = xmlBlocks(text, 'LiveEvent')
    .map(block => ({
      title: xmlValue(block, 'EventTitle'),
      description: xmlValue(block, 'Description'),
      type: xmlValue(block, 'EventType'),
      road: xmlValue(block, 'Road'),
      direction: xmlValue(block, 'Direction'),
      start: xmlValue(block, 'StartKM'),
      end: xmlValue(block, 'EndKM'),
      sectionStart: xmlValue(block, 'SectionStart'),
      sectionEnd: xmlValue(block, 'SectionEnd'),
      impact: xmlValue(block, 'Description'),
      source: xmlValue(block, 'Source'),
      updateTime: xmlValue(block, 'LastUpdateTime') || xmlValue(block, 'PublishTime'),
      point: pointFromWkt(xmlValue(block, 'Positions'))
    }))
    .filter(event => wantedTypes.has(event.type));

  if (events.length === 0) {
    return { status: 'no-event', source: '高速公路局 TISVCloud LiveEvents', body: '目前沒有符合條件的國道路況事件。' };
  }

  const withDistance = Number(location.lat) && Number(location.lng)
    ? events.map(event => ({ ...event, distance: event.point ? distanceKm(Number(location.lat), Number(location.lng), event.point.lat, event.point.lng) : Infinity }))
      .sort((a, b) => a.distance - b.distance)
    : events;
  const event = withDistance[0];
  const distanceText = Number.isFinite(event.distance) ? `，距離約 ${Math.round(event.distance)} 公里` : '';
  return {
    status: 'live',
    source: '高速公路局 TISVCloud LiveEvents',
    body: `${event.description || event.title}${distanceText}${event.updateTime ? `（更新 ${event.updateTime}）` : ''}`,
    shouldNotify: rule.moduleId === 'road-incident' && ['1', '4', '6', '8'].includes(event.type)
  };
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parkingAvailabilityText(value) {
  const available = numericValue(value);
  if (available === null || available < 0) return '剩餘車位未提供';
  return `剩餘汽車位 ${available} 格`;
}

function parkingRgbText(value) {
  const color = `${value || ''}`.toUpperCase();
  if (color === 'G') return '空位充足';
  if (color === 'Y') return '車位偏少';
  if (color === 'R') return '接近滿車';
  return '剩餘狀態未提供';
}

function parkingDistance(record, location) {
  const lat = numericValue(record.lat || record.Lat || record.latitude || record.tw97y);
  const lng = numericValue(record.lng || record.Lng || record.longitude || record.tw97x);
  if (!Number(location.lat) || !Number(location.lng) || lat === null || lng === null || lat > 1000 || lng > 1000) return Infinity;
  return distanceKm(Number(location.lat), Number(location.lng), lat, lng);
}

function pickParkingRecords(records, location) {
  const district = location.district || '';
  const scoped = district
    ? records.filter(record => `${record.area || record.AREA || record.name || record.NAME || record.Position || record.address || record.ADDRESS || record.KeyWord || ''}`.includes(district))
    : records;
  return (scoped.length ? scoped : records)
    .filter(record => {
      const available = numericValue(record.availablecar ?? record.AVAILABLECAR);
      return available === null || available >= 0;
    })
    .map(record => ({ ...record, distance: parkingDistance(record, location) }))
    .sort((left, right) => {
      if (Number.isFinite(left.distance) || Number.isFinite(right.distance)) return left.distance - right.distance;
      const leftAvailable = numericValue(left.availablecar ?? left.AVAILABLECAR) ?? -1;
      const rightAvailable = numericValue(right.availablecar ?? right.AVAILABLECAR) ?? -1;
      return rightAvailable - leftAvailable;
    })
    .slice(0, 3);
}

async function taipeiParking(location) {
  const urls = parkingDefaults[canonicalCity(location.city)] || parkingDefaults[location.city];
  const [availability, details] = await Promise.all([
    fetchJson(urls.availability, { timeoutMs: 7000 }),
    fetchJson(urls.details, { timeoutMs: 7000 })
  ]);
  const availableRecords = availability?.data?.park || [];
  const detailRecords = details?.data?.park || [];
  if (!availableRecords.length || !detailRecords.length) {
    return { status: 'no-event', source: '臺北市停車管理工程處停車場剩餘車位', body: '臺北市停車場資料源暫時無法連線。' };
  }
  const detailById = new Map(detailRecords.map(record => [record.id, record]));
  const records = availableRecords.map(record => ({ ...detailById.get(record.id), ...record }));
  const picked = pickParkingRecords(records, location);
  if (!picked.length) return { status: 'no-event', source: '臺北市停車管理工程處停車場剩餘車位', body: `${location.city}${location.district || ''}目前沒有可用停車場剩餘車位資料。` };
  return {
    status: 'live',
    source: '臺北市停車管理工程處停車場剩餘車位',
    body: picked.map(record => `${record.area || location.district || ''}${record.name || record.id}：${parkingAvailabilityText(record.availablecar)}${Number.isFinite(record.distance) ? `，約 ${record.distance.toFixed(1)} 公里` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function newTaipeiParking(location) {
  const urls = parkingDefaults[location.city];
  const [availability, details] = await Promise.all([
    fetchData(urls.availability, { timeoutMs: 7000 }),
    fetchData(urls.details, { timeoutMs: 7000 })
  ]);
  if (!Array.isArray(availability) || !Array.isArray(details)) {
    return { status: 'no-event', source: '新北市公有路外停車場即時賸餘車位數', body: '新北市停車場資料源暫時無法連線。' };
  }
  const detailById = new Map(details.map(record => [record.ID, record]));
  const records = availability.map(record => ({ ...detailById.get(record.ID), ...record }));
  const picked = pickParkingRecords(records, location);
  if (!picked.length) return { status: 'no-event', source: '新北市公有路外停車場即時賸餘車位數', body: `${location.city}${location.district || ''}目前沒有可用停車場剩餘車位資料。` };
  return {
    status: 'live',
    source: '新北市公有路外停車場即時賸餘車位數',
    body: picked.map(record => `${record.AREA || location.district || ''}${record.NAME || record.ID}：${parkingAvailabilityText(record.AVAILABLECAR)}${record.ADDRESS ? `，${record.ADDRESS}` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function keelungParking(location) {
  const html = await fetchText(parkingDefaults[location.city]?.availability, { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)]
    .map(match => ({
      city: '基隆市',
      name: cleanHtmlText(match[1]),
      availablecar: cleanHtmlText(match[2]),
      updatedAt: cleanHtmlText(match[3])
    }))
    .filter(record => record.name && record.name !== '停車場名稱');
  if (!rows.length) return { status: 'no-event', source: '基隆停車場剩餘車位', body: '基隆市停車場資料源暫時無法連線。' };
  const picked = pickParkingRecords(rows, location);
  if (!picked.length) return { status: 'no-event', source: '基隆停車場剩餘車位', body: `${location.city}${location.district || ''}目前沒有可用停車場剩餘車位資料。` };
  return {
    status: 'live',
    source: '基隆停車場剩餘車位',
    body: picked.map(record => `${record.name}：${parkingAvailabilityText(record.availablecar)}${record.updatedAt ? `，更新 ${record.updatedAt}` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function hsinchuCityParking(location) {
  const data = await fetchJson(parkingDefaults[location.city]?.availability, { timeoutMs: 7000 });
  if (!Array.isArray(data) || !data.length) return officialParkingPortal(location);
  const records = data.map(record => ({
    ...record,
    area: record.ADDRESS,
    name: record.PARKINGNAME,
    address: record.ADDRESS,
    availablecar: record.FREEQUANTITY,
    totalcar: record.TOTALQUANTITY,
    lat: record.LATITUDE,
    lng: record.LONGITUDE
  }));
  const picked = pickParkingRecords(records, location);
  if (!picked.length) return { status: 'no-event', source: '新竹市剩餘停車位資訊', body: `${location.city}${location.district || ''}目前沒有可用停車場剩餘車位資料。` };
  return {
    status: 'live',
    source: '新竹市剩餘停車位資訊',
    body: picked.map(record => `${record.PARKINGNAME || record.PARKNO}：${parkingAvailabilityText(record.FREEQUANTITY)}，總汽車位 ${record.TOTALQUANTITY ?? '未提供'} 格${record.UPDATETIME ? `，更新 ${record.UPDATETIME}` : ''}${record.ADDRESS ? `，${record.ADDRESS}` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function changhuaParking(location) {
  const data = await fetchJson(parkingDefaults[location.city]?.availability, {
    timeoutMs: 7000,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: ''
  });
  if (!Array.isArray(data) || !data.length) return { status: 'no-event', source: '彰化縣路邊停車智慧車格', body: '彰化縣停車資料源暫時無法連線。' };
  const grouped = new Map();
  for (const record of data) {
    const name = record.billSegment || '未命名路段';
    const current = grouped.get(name) || {
      city: '彰化縣',
      area: name,
      name,
      availablecar: 0,
      totalcar: 0,
      updatedAt: record.created
    };
    current.totalcar += 1;
    if (`${record.status}` === '0') current.availablecar += 1;
    current.updatedAt = record.created || current.updatedAt;
    current.lat = current.lat || record.latitude;
    current.lng = current.lng || record.longitude;
    grouped.set(name, current);
  }
  const records = [...grouped.values()];
  const picked = pickParkingRecords(records, location);
  if (!picked.length) return { status: 'no-event', source: '彰化縣路邊停車智慧車格', body: `${location.city}${location.district || ''}目前沒有可用智慧停車格資料。` };
  return {
    status: 'live',
    source: '彰化縣路邊停車智慧車格',
    body: picked.map(record => `${record.name}：可用車格 ${record.availablecar} 格，總車格 ${record.totalcar} 格${record.updatedAt ? `，更新 ${record.updatedAt}` : ''}${Number.isFinite(record.distance) ? `，約 ${record.distance.toFixed(1)} 公里` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function chiayiCityParking(location) {
  const html = await fetchText(parkingDefaults[location.city]?.availability, { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<tr>\s*<td class="c1">[\s\S]*?<\/td>\s*<td class="c2">([\s\S]*?)<\/td>\s*<td class="c3">([\s\S]*?)<\/td>\s*<td class="c4"[^>]*>([\s\S]*?)<\/td>\s*<td class="c5">[\s\S]*?<\/td>\s*<td class="c6">([\s\S]*?)<\/td>\s*<\/tr>/g)]
    .map(match => {
      const total = cleanHtmlText(match[2]).match(/\d+/)?.[0] || '';
      const availabilityText = cleanHtmlText(match[3]);
      const available = availabilityText.includes('滿場') ? 0 : availabilityText.match(/（(\d+)）/)?.[1];
      return {
        city: '嘉義市',
        name: cleanHtmlText(match[1]),
        availablecar: available,
        totalcar: total,
        updatedAt: cleanHtmlText(match[4])
      };
    })
    .filter(record => record.name && record.availablecar !== undefined);
  if (!rows.length) return { status: 'no-event', source: '嘉義市智慧停車場管理雲端平臺', body: '嘉義市停車場資料源暫時無法連線。' };
  const picked = pickParkingRecords(rows, location);
  if (!picked.length) return { status: 'no-event', source: '嘉義市智慧停車場管理雲端平臺', body: `${location.city}${location.district || ''}目前沒有可用停車場剩餘車位資料。` };
  return {
    status: 'live',
    source: '嘉義市智慧停車場管理雲端平臺',
    body: picked.map(record => `${record.name}：${parkingAvailabilityText(record.availablecar)}，總汽車位 ${record.totalcar || '未提供'} 格${record.updatedAt ? `，更新 ${record.updatedAt}` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function taoyuanParking(location) {
  const url = parkingDefaults[location.city]?.availability;
  const data = await fetchData(url, { timeoutMs: 7000 });
  if (!Array.isArray(data)) {
    return { status: 'no-event', source: '桃園市路外停車資訊', body: '桃園市停車場資料源暫時無法連線。' };
  }
  const records = data.map(record => ({
    ...record,
    area: record.areaName,
    name: record.parkName,
    address: record.address,
    availablecar: record.surplusSpace,
    lat: record.wgsX,
    lng: record.wgsY
  }));
  const picked = pickParkingRecords(records, location);
  if (!picked.length) return { status: 'no-event', source: '桃園市路外停車資訊', body: `${location.city}${location.district || ''}目前沒有可用停車場剩餘車位資料。` };
  return {
    status: 'live',
    source: '桃園市路外停車資訊',
    body: picked.map(record => `${record.areaName || location.district || ''}${record.parkName || record.parkId}：${parkingAvailabilityText(record.surplusSpace)}，總汽車位 ${record.totalSpace || '未提供'} 格${Number.isFinite(record.distance) ? `，約 ${record.distance.toFixed(1)} 公里` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function taichungParking(location) {
  const url = parkingDefaults[canonicalCity(location.city)]?.availability || parkingDefaults[location.city]?.availability;
  const data = await fetchData(url, { timeoutMs: 7000 });
  if (!Array.isArray(data)) {
    return { status: 'no-event', source: '臺中市路外剩餘車位', body: '臺中市停車場資料源暫時無法連線。' };
  }
  const records = data.map(record => ({
    ...record,
    name: record.Position,
    lat: record.Lat,
    lng: record.Lng
  }));
  const picked = pickParkingRecords(records, location);
  if (!picked.length) return { status: 'no-event', source: '臺中市路外剩餘車位', body: `${location.city}${location.district || ''}目前沒有可用停車場剩餘車位資料。` };
  return {
    status: 'live',
    source: '臺中市路外剩餘車位',
    body: picked.map(record => `${record.Position}：${parkingRgbText(record.AvailableCarRGB)}，總汽車位 ${record.TotalCar || '未提供'} 格${Number.isFinite(record.distance) ? `，約 ${record.distance.toFixed(1)} 公里` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function tainanParking(location) {
  const url = parkingDefaults[canonicalCity(location.city)]?.availability || parkingDefaults[location.city]?.availability;
  let data = await fetchJson(url, { timeoutMs: 7000 });
  let source = '臺南市停車場即時剩餘車位資訊';
  if (!Array.isArray(data?.data) || !data.data.length) {
    data = readTainanParkingFallback();
    source = '臺南市停車場即時剩餘車位資訊快取';
  }
  const rawRecords = Array.isArray(data?.data) ? data.data : [];
  if (!rawRecords.length) {
    return { status: 'no-event', source, body: '臺南市停車場資料源暫時無法連線。' };
  }
  const records = rawRecords.map(record => {
    const [lat, lng] = `${record.lnglat || ''}`.split(',').map(value => Number(value.trim()));
    return {
      ...record,
      area: record.zone,
      name: record.name,
      address: record.address,
      availablecar: record.car,
      lat,
      lng
    };
  });
  const picked = pickParkingRecords(records, location);
  if (!picked.length) return { status: 'no-event', source, body: `${location.city}${location.district || ''}目前沒有可用停車場剩餘車位資料。` };
  return {
    status: 'live',
    source,
    body: picked.map(record => `${record.zone || location.district || ''}${record.name || record.id}：${parkingAvailabilityText(record.car)}，總汽車位 ${record.car_total ?? '未提供'} 格${record.update_time ? `，更新 ${record.update_time}` : ''}${Number.isFinite(record.distance) ? `，約 ${record.distance.toFixed(1)} 公里` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function kaohsiungParking(location) {
  const url = parkingDefaults[location.city]?.availability;
  let data = await fetchJson(url, {
    timeoutMs: 7000,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://kpp.tbkc.gov.tw/ParkingLocation/ParkingLocation'
    },
    body: ''
  });
  let source = '高雄市停車場即時資訊';
  if (!Array.isArray(data?.parkingLots) || !data.parkingLots.length) {
    data = readKaohsiungParkingFallback();
    source = '高雄市停車場即時資訊快取';
  }
  const rawRecords = Array.isArray(data?.parkingLots) ? data.parkingLots : [];
  if (!rawRecords.length) {
    return { status: 'no-event', source, body: '高雄市停車場資料源暫時無法連線。' };
  }
  const records = rawRecords.map(record => ({
    ...record,
    area: record.areaname,
    name: record.name,
    address: record.location,
    availablecar: record.leftspace,
    lat: record.lat,
    lng: record.lng
  }));
  const picked = pickParkingRecords(records, location);
  if (!picked.length) return { status: 'no-event', source, body: `${location.city}${location.district || ''}目前沒有可用停車場即時剩餘車位資料。` };
  return {
    status: 'live',
    source,
    body: picked.map(record => `${record.areaname || location.district || ''}${record.name || record.id}：${parkingAvailabilityText(record.leftspace)}，總汽車位 ${record.volumnAuto || record.volumn || '未提供'} 格${record.location ? `，${record.location}` : ''}${Number.isFinite(record.distance) ? `，約 ${record.distance.toFixed(1)} 公里` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function yilanParking(location) {
  const url = parkingDefaults[location.city]?.availability;
  let data = await fetchData(url, { timeoutMs: 7000 });
  let source = '宜蘭縣停車場停車位即時剩餘數';
  if (!Array.isArray(data) || !data.length) {
    data = readYilanParkingFallback();
    source = '宜蘭縣停車場停車位即時剩餘數快取';
  }
  if (!Array.isArray(data)) {
    return { status: 'no-event', source, body: '宜蘭縣停車場資料源暫時無法連線。' };
  }
  const records = data.map(record => ({
    ...record,
    name: record.名稱,
    availablecar: record.小車位剩餘數,
    totalcar: record.小車位總數
  }));
  const picked = pickParkingRecords(records, location);
  if (!picked.length) return { status: 'no-event', source, body: `${location.city}${location.district || ''}目前沒有可用停車場剩餘車位資料。` };
  return {
    status: 'live',
    source,
    body: picked.map(record => `${record.名稱 || record.編號}：${parkingAvailabilityText(record.小車位剩餘數)}，總汽車位 ${record.小車位總數 || '未提供'} 格${record.更新時間 ? `，更新 ${record.更新時間}` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function opendataVipParking(location) {
  const url = parkingDefaults[location.city]?.availability;
  const html = await fetchText(url, { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map(match => {
      const [availablecar, totalcar] = cleanHtmlText(match[2]).split('/').map(value => value.trim());
      return {
        city: location.city,
        name: cleanHtmlText(match[1]),
        availablecar,
        totalcar,
        statusText: cleanHtmlText(match[4]),
        feeText: cleanHtmlText(match[5])
      };
    })
    .filter(record => record.name && numericValue(record.availablecar) !== null);
  if (!rows.length) return { status: 'no-event', source: 'TDX 停車資訊公開查詢頁', body: `${location.city}停車資料源暫時無法連線。` };
  const picked = pickParkingRecords(rows, location);
  if (!picked.length) return { status: 'no-event', source: 'TDX 停車資訊公開查詢頁', body: `${location.city}${location.district || ''}目前沒有可用停車場剩餘車位資料。` };
  return {
    status: 'live',
    source: `${location.city}停車資訊公開查詢頁（TDX 衍生）`,
    body: picked.map(record => `${record.name}：${parkingAvailabilityText(record.availablecar)}，總汽車位 ${record.totalcar || '未提供'} 格${record.statusText ? `，${record.statusText}` : ''}${record.feeText ? `，${record.feeText}` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function lianjiangParking(location) {
  const urls = parkingDefaults[location.city];
  const [lots, spaces] = await Promise.all([
    fetchJson(urls.availability, { timeoutMs: 7000 }),
    fetchJson(urls.spaces, { timeoutMs: 7000 })
  ]);
  const lotRecords = Array.isArray(lots?.parking_lots) ? lots.parking_lots : [];
  const spaceRecords = Array.isArray(spaces?.available_spaces) ? spaces.available_spaces : [];
  if (!lotRecords.length) return { status: 'no-event', source: '連江縣智慧停車平台', body: '連江縣停車場資料源暫時無法連線。' };
  const availableById = new Map(spaceRecords.map(record => [record.parking_id, record.spaces]));
  const records = lotRecords.map(record => ({
    ...record,
    availablecar: availableById.get(record.parking_id),
    totalcar: record.spaces,
    lat: record.lat,
    lng: record.lng
  }));
  const picked = pickParkingRecords(records, location);
  if (!picked.length) return { status: 'no-event', source: '連江縣智慧停車平台', body: `${location.city}${location.district || ''}目前沒有可用停車場剩餘車位資料。` };
  return {
    status: 'live',
    source: '連江縣智慧停車平台',
    body: picked.map(record => `${record.name}：${parkingAvailabilityText(record.availablecar)}，總汽車位 ${record.totalcar || '未提供'} 格${record.address ? `，${record.address}` : ''}${Number.isFinite(record.distance) ? `，約 ${record.distance.toFixed(1)} 公里` : ''}`).join('；'),
    shouldNotify: false
  };
}

async function officialParkingPortal(location) {
  const config = parkingDefaults[location.city];
  if (config?.summary) {
    return {
      status: 'live',
      source: config.label || `${location.city}官方停車資訊`,
      body: `${location.city}${location.district || ''}目前接入官方停車資訊：${config.summary}`,
      shouldNotify: false
    };
  }
  const html = await fetchText(config?.info, { timeoutMs: 7000 });
  const title = cleanHtmlText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || config?.label || `${location.city}停車資訊`);
  const snippets = [...html.matchAll(/<(?:h1|h2|h3|p|td)[^>]*>([\s\S]*?(?:停車場|停車格|車位|收費路段|停車費)[\s\S]*?)<\/(?:h1|h2|h3|p|td)>/gi)]
    .map(match => cleanHtmlText(match[1]))
    .filter(text => text && text.length >= 6 && text.length <= 120)
    .filter((text, index, array) => array.indexOf(text) === index)
    .slice(0, 3);
  return {
    status: 'live',
    source: config?.label || title,
    body: snippets.length
      ? `${location.city}${location.district || ''}目前接入官方停車資訊：${snippets.join('；')}。此來源未提供即時剩餘車位，依現場公告為準。`
      : `${location.city}${location.district || ''}目前接入官方停車資訊入口：${title}。此來源未提供即時剩餘車位，依現場公告為準。`,
    shouldNotify: false
  };
}

async function parkingInfo(location) {
  const city = canonicalCity(location.city);
  if (city === '基隆市') return keelungParking({ ...location, city });
  if (city === '新竹市') return hsinchuCityParking({ ...location, city });
  if (city === '彰化縣') return changhuaParking({ ...location, city });
  if (city === '嘉義市') return chiayiCityParking({ ...location, city });
  if (city === '臺北市') return taipeiParking({ ...location, city });
  if (city === '新北市') return newTaipeiParking({ ...location, city });
  if (city === '桃園市') return taoyuanParking({ ...location, city });
  if (city === '臺中市') return taichungParking({ ...location, city });
  if (city === '臺南市') return tainanParking({ ...location, city });
  if (city === '高雄市') return kaohsiungParking({ ...location, city });
  if (city === '宜蘭縣') return yilanParking({ ...location, city });
  if (['雲林縣', '屏東縣', '花蓮縣', '金門縣'].includes(city)) return opendataVipParking({ ...location, city });
  if (city === '連江縣') return lianjiangParking({ ...location, city });
  if (parkingDefaults[city]?.info) return officialParkingPortal({ ...location, city });
  return genericConfiguredSource({ moduleId: 'parking' }, location);
}

function emergencyMatches(record, location) {
  const text = JSON.stringify(record);
  return (!location.city || text.includes(location.city) || text.includes(canonicalCity(location.city)) || text.includes(displayCity(canonicalCity(location.city)))) &&
    (!location.district || text.includes(location.district));
}

async function taipeiFire(location) {
  const data = await fetchJson(fireDefaults[canonicalCity(location.city)], {
    timeoutMs: 7000,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://service119.tfd.gov.tw/service119/accCase'
    },
    body: new URLSearchParams({ page: '1', rows: '30' })
  });
  const records = data?.rows || [];
  if (!records.length) return { status: 'no-event', source: '臺北市政府消防局 119 即時案件', body: '臺北市目前沒有公開中的 119 即時案件。' };
  const matched = records.find(record => /火|災害|搶救/.test(`${record.csKindName || ''}${record.csCodeName || ''}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '臺北市政府消防局 119 即時案件', body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source: '臺北市政府消防局 119 即時案件',
    body: `${matched.csPlaceFuzzy || matched.csPlace || location.city}，${matched.csKindName || '消防案件'}${matched.csCodeName ? `/${matched.csCodeName}` : ''}，狀態 ${matched.caseStatus || '已受理'}，受理 ${matched.inTime || '時間未提供'}。`,
    shouldNotify: true
  };
}

async function newTaipeiFire(location) {
  const data = await fetchJson(fireDefaults[location.city], { timeoutMs: 7000 });
  const featureCollection = typeof data?.data === 'string' ? JSON.parse(data.data) : data?.data;
  const features = featureCollection?.features || [];
  if (!features.length) return { status: 'no-event', source: '新北市消防救援動態 GeoJSON', body: '新北市目前沒有公開中的消防救援案件。' };
  const records = features.map(feature => feature.properties || {});
  const matched = records.find(record => /火|災害|搶救/.test(`${record.fireType || ''}${record.title || ''}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '新北市消防救援動態 GeoJSON', body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source: '新北市消防救援動態 GeoJSON',
    body: `${matched.endPointInfo || location.city}，${matched.fireType || '消防救援'}，案件 ${matched.featureId || '編號未提供'}。`,
    shouldNotify: true
  };
}

async function keelungFire(location) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<li>\s*<span class="num">.*?<\/span>\s*<span class="list__title"><a href="([^"]+)" title="([^"]+)"[\s\S]*?<\/a><\/span>\s*<time>(.*?)<\/time>\s*<\/li>/g)]
    .map(match => ({
      link: match[1],
      title: cleanHtmlText(match[2]),
      time: cleanHtmlText(match[3]),
      type: '火災資訊',
      subtype: '',
      place: cleanHtmlText(match[2]),
      status: '官方公告'
    }))
    .filter(record => /火|火警|火災/.test(record.title));
  if (!rows.length) return { status: 'no-event', source: '基隆市消防局火災資訊', body: '基隆市目前沒有公開火災資訊。' };
  const matched = rows.find(record => emergencyMatches(record, location)) || rows[0];
  return {
    status: 'live',
    source: '基隆市消防局火災資訊',
    body: `${matched.title}，公告日期 ${matched.time || '未提供'}。`,
    shouldNotify: false
  };
}

async function hsinchuCountyFire(location) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<a href="([^"]+)" class="d-flex" title="([^"]+)"[\s\S]*?<span class="mon">[\s\S]*?<\/span>(.*?)<\/span>[\s\S]*?<span class="sr-only">發佈單位<\/span>(.*?)<\/div>/g)]
    .map(match => ({
      link: match[1],
      title: cleanHtmlText(match[2]),
      time: cleanHtmlText(match[3]),
      station: cleanHtmlText(match[4]),
      type: cleanHtmlText(match[2]).split('－')[0],
      place: `${location.city}${cleanHtmlText(match[2])}`,
      status: '官方即時災情'
    }))
    .filter(record => /火|瓦斯|災害|搶救/.test(`${record.type}${record.title}`));
  if (!rows.length) return { status: 'no-event', source: '新竹縣政府消防局即時災情', body: '新竹縣目前沒有公開中的消防即時災情。' };
  const matched = rows.find(record => /火|災害|搶救/.test(`${record.type}${record.title}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '新竹縣政府消防局即時災情', body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source: '新竹縣政府消防局即時災情',
    body: `${matched.title}，發布 ${matched.time || '時間未提供'}，單位 ${matched.station || '未提供'}。`,
    shouldNotify: false
  };
}

async function hsinchuCityFire(location) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]+title="([^"]+)"[\s\S]*?<p class="color02">[\s\S]*?發布日期：([^<]+)<\/p>[\s\S]*?<p class="color01">[\s\S]*?發布單位：([^<]+)<\/p>[\s\S]*?<p class="subject">([^<]+)<\/p>/g)]
    .map(match => ({
      link: `https://119.hccg.gov.tw${match[1].replace(/&amp;/g, '&')}`,
      title: cleanHtmlText(match[2] || match[5]),
      time: cleanHtmlText(match[3]),
      station: cleanHtmlText(match[4]),
      type: '救災救護',
      place: cleanHtmlText(match[2] || match[5]),
      status: '官方救災救護資訊'
    }))
    .filter(record => /火|火警|災害|搶救/.test(`${record.title}${record.place}`));
  if (!rows.length) return { status: 'no-event', source: '新竹市消防局救災救護', body: '新竹市目前沒有公開救災救護火警資訊。' };
  const matched = rows.find(record => emergencyMatches(record, location)) || rows[0];
  return {
    status: 'live',
    source: '新竹市消防局救災救護',
    body: `${matched.title}，發布 ${matched.time || '時間未提供'}，單位 ${matched.station || '未提供'}。`,
    shouldNotify: false
  };
}

function cleanHtmlText(html = '') {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function taoyuanFire(location) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<date>(.*?)<\/date>[\s\S]*?<span class="title">案類<\/span>(.*?)<\/div>[\s\S]*?<span class="title">案別<\/span>(.*?)<\/div>[\s\S]*?<span class="title">發生地點<\/span>(.*?)<\/div>[\s\S]*?<span class="title">派遣分隊<\/span>(.*?)<\/div>[\s\S]*?<div class="td state">([\s\S]*?)<\/div>/g)]
    .map(match => ({
      time: cleanHtmlText(match[1]),
      type: cleanHtmlText(match[2]),
      subtype: cleanHtmlText(match[3]),
      place: cleanHtmlText(match[4]),
      station: cleanHtmlText(match[5]),
      status: cleanHtmlText(match[6])
    }));
  if (!rows.length) return { status: 'no-event', source: '桃園市政府消防局即時災情', body: '桃園市目前沒有公開中的消防即時災情。' };
  const matched = rows.find(record => /火|災害|搶救/.test(`${record.type}${record.subtype}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '桃園市政府消防局即時災情', body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source: '桃園市政府消防局即時災情',
    body: `${matched.place || location.city}，${matched.type || '消防案件'}${matched.subtype ? `/${matched.subtype}` : ''}，派遣 ${matched.station || '未提供'}，狀態 ${matched.status || '未提供'}，發生 ${matched.time || '時間未提供'}。`,
    shouldNotify: matched.status !== '已完成'
  };
}

async function taichungFire(location) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<li>\s*<span>([\s\S]*?)<\/span>\s*<span>([\s\S]*?)<\/span>\s*<span>([\s\S]*?)<\/span>\s*<span>([\s\S]*?)<\/span>\s*<\/li>/g)]
    .map(match => ({
      city: '臺中市',
      time: cleanHtmlText(match[1]),
      type: cleanHtmlText(match[2]),
      subtype: '',
      place: `臺中市${cleanHtmlText(match[3])}`,
      station: '',
      status: cleanHtmlText(match[4])
    }))
    .filter(record => record.time !== '受理時間');
  if (!rows.length) return { status: 'no-event', source: '臺中市政府消防局即時災情', body: '臺中市目前沒有公開中的消防即時災情。' };
  const matched = rows.find(record => /火|災害|搶救/.test(`${record.type}${record.subtype}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '臺中市政府消防局即時災情', body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source: '臺中市政府消防局即時災情',
    body: `${matched.place || location.city}，${matched.type || '消防案件'}，狀態 ${matched.status || '未提供'}，受理 ${matched.time || '時間未提供'}。`,
    shouldNotify: !/返隊|完成|結案/.test(matched.status || '')
  };
}

async function miaoliFire(location) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<tr>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/g)]
    .map(match => ({
      time: cleanHtmlText(match[2]),
      type: cleanHtmlText(match[3]),
      subtype: '',
      place: cleanHtmlText(match[4]),
      station: cleanHtmlText(match[5]),
      status: cleanHtmlText(match[6])
    }));
  if (!rows.length) return { status: 'no-event', source: '苗栗縣政府消防局 119 即時案件', body: '苗栗縣目前沒有公開中的消防即時案件。' };
  const matched = rows.find(record => /火|災害|搶救/.test(`${record.type}${record.subtype}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '苗栗縣政府消防局 119 即時案件', body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source: '苗栗縣政府消防局 119 即時案件',
    body: `${matched.place || location.city}，${matched.type || '消防案件'}，派遣 ${matched.station || '未提供'}，狀態 ${matched.status || '未提供'}，受理 ${matched.time || '時間未提供'}。`,
    shouldNotify: !/返隊|完成|結案/.test(matched.status || '')
  };
}

async function dtsFire(location, source) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<tr>\s*<td>(?:[\s\S]*?)<\/td>\s*(?:<!--[\s\S]*?-->\s*)?<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*(?:<td>([\s\S]*?)<\/td>\s*)?<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)]
    .map(match => ({
      time: cleanHtmlText(match[1]),
      type: cleanHtmlText(match[2]),
      subtype: cleanHtmlText(match[3] || ''),
      place: cleanHtmlText(match[4]),
      station: cleanHtmlText(match[5]),
      status: cleanHtmlText(match[6])
    }));
  if (!rows.length) return { status: 'no-event', source, body: `${location.city}目前沒有公開中的消防即時案件。` };
  const matched = rows.find(record => /火|災害|搶救/.test(`${record.type}${record.subtype}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source, body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source,
    body: `${matched.place || location.city}，${matched.type || '消防案件'}${matched.subtype ? `/${matched.subtype}` : ''}，派遣 ${matched.station || '未提供'}，狀態 ${matched.status || '未提供'}，受理 ${matched.time || '時間未提供'}。`,
    shouldNotify: !/返隊|完成|結案|已返隊/.test(matched.status || '')
  };
}

async function changhuaFire(location) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/data-th="受理時間：".*?<\/span>(.*?)<\/span>[\s\S]*?data-th="案類：".*?<\/span>(.*?)<\/span>[\s\S]*?data-th="案別：".*?<\/span>(.*?)<\/span>[\s\S]*?data-th="發生地點：".*?<\/span>(.*?)<\/span>[\s\S]*?data-th="派遣分隊：".*?<\/span>(.*?)<\/span>[\s\S]*?data-th="執行狀況：".*?<\/span>(.*?)<\/span>/g)]
    .map(match => ({
      time: cleanHtmlText(match[1]),
      type: cleanHtmlText(match[2]),
      subtype: cleanHtmlText(match[3]),
      place: cleanHtmlText(match[4]),
      station: cleanHtmlText(match[5]),
      status: cleanHtmlText(match[6])
    }));
  if (!rows.length) return { status: 'no-event', source: '彰化縣消防局即時災情', body: '彰化縣目前沒有公開中的消防即時災情。' };
  const matched = rows.find(record => /火|災害|搶救/.test(`${record.type}${record.subtype}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '彰化縣消防局即時災情', body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source: '彰化縣消防局即時災情',
    body: `彰化縣${matched.place || location.district || ''}，${matched.type || '消防案件'}${matched.subtype ? `/${matched.subtype}` : ''}，派遣 ${matched.station || '未提供'}，狀態 ${matched.status || '未提供'}，受理 ${matched.time || '時間未提供'}。`,
    shouldNotify: !/到達醫院|送往醫院|返隊|完成|結案/.test(matched.status || '')
  };
}

async function nantouFire(location) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<tr>\s*<td data-th="受理案件">(.*?)<\/td>\s*<td data-th="案類"[^>]*>(.*?)<\/td>\s*<td data-th="案別">(.*?)<\/td>\s*<td data-th="發生地點">(.*?)<\/td>\s*<td data-th="派遣分隊">(.*?)<\/td>\s*<td data-th="執行狀況"[^>]*>(.*?)<\/td>\s*<\/tr>/g)]
    .map(match => ({
      time: cleanHtmlText(match[1]),
      type: cleanHtmlText(match[2]),
      subtype: cleanHtmlText(match[3]),
      place: cleanHtmlText(match[4]),
      station: cleanHtmlText(match[5]),
      status: cleanHtmlText(match[6])
    }));
  if (!rows.length) return { status: 'no-event', source: '南投縣政府消防局 119 訊息', body: '南投縣目前沒有公開中的消防即時案件。' };
  const matched = rows.find(record => /火|災害|搶救/.test(`${record.type}${record.subtype}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '南投縣政府消防局 119 訊息', body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source: '南投縣政府消防局 119 訊息',
    body: `${matched.place || location.city}，${matched.type || '消防案件'}${matched.subtype ? `/${matched.subtype}` : ''}，派遣 ${matched.station || '未提供'}，狀態 ${matched.status || '未提供'}，受理 ${matched.time || '時間未提供'}。`,
    shouldNotify: !/返隊|離院|完成|結案/.test(matched.status || '')
  };
}

async function chiayiCountyFire(location) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<tr>\s*<td>\s*<p>(.*?)<\/p>\s*<\/td>\s*<td>\s*<p>(.*?)<\/p>\s*<\/td>\s*<td[^>]*>\s*<p>(.*?)<\/p>\s*<\/td>\s*<td>\s*<p>(.*?)<\/p>\s*<\/td>\s*<td>\s*<p>(.*?)<\/p>\s*<\/td>\s*<\/tr>/g)]
    .map(match => {
      const [type, subtype = ''] = cleanHtmlText(match[2]).split('-');
      return {
        time: cleanHtmlText(match[1]),
        type,
        subtype,
        place: cleanHtmlText(match[3]),
        station: cleanHtmlText(match[4]),
        status: cleanHtmlText(match[5])
      };
    });
  if (!rows.length) return { status: 'no-event', source: '嘉義縣消防局即時災情', body: '嘉義縣目前沒有公開中的消防即時災情。' };
  const matched = rows.find(record => /火|災害|搶救/.test(`${record.type}${record.subtype}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '嘉義縣消防局即時災情', body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source: '嘉義縣消防局即時災情',
    body: `${matched.place || location.city}，${matched.type || '消防案件'}${matched.subtype ? `/${matched.subtype}` : ''}，派遣 ${matched.station || '未提供'}，狀態 ${matched.status || '未提供'}，受理 ${matched.time || '時間未提供'}。`,
    shouldNotify: !/完成|返隊|結案/.test(matched.status || '')
  };
}

async function chiayiCityFire(location) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<tr>\s*<td>\s*<p>(.*?)<\/p>\s*<\/td>\s*<td>\s*<p>(.*?)<\/p>\s*<\/td>\s*<td[^>]*>\s*<p>(.*?)<\/p>\s*<\/td>\s*<td>\s*<p>(.*?)<\/p>\s*<\/td>\s*<td>\s*<p>(.*?)<\/p>\s*<\/td>\s*<\/tr>/g)]
    .map(match => {
      const [type, subtype = ''] = cleanHtmlText(match[2]).split('-');
      return {
        time: cleanHtmlText(match[1]),
        type,
        subtype,
        place: cleanHtmlText(match[3]),
        station: cleanHtmlText(match[4]),
        status: cleanHtmlText(match[5])
      };
    });
  if (!rows.length) return { status: 'no-event', source: '嘉義市消防局火警案件即時災情', body: '嘉義市目前沒有公開中的火警案件即時災情。' };
  const matched = rows.find(record => /火|災害|搶救/.test(`${record.type}${record.subtype}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '嘉義市消防局火警案件即時災情', body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source: '嘉義市消防局火警案件即時災情',
    body: `${matched.place || location.city}，${matched.type || '消防案件'}${matched.subtype ? `/${matched.subtype}` : ''}，派遣 ${matched.station || '未提供'}，狀態 ${matched.status || '未提供'}，受理 ${matched.time || '時間未提供'}。`,
    shouldNotify: !/完成|返隊|結案/.test(matched.status || '')
  };
}

async function pingtungFire(location) {
  const html = await fetchText(fireDefaults[location.city], { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td class="text-start">([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)]
    .map(match => ({
      time: cleanHtmlText(match[5]),
      type: cleanHtmlText(match[1]),
      subtype: '',
      place: cleanHtmlText(match[2]),
      station: cleanHtmlText(match[3]),
      status: cleanHtmlText(match[4])
    }));
  if (!rows.length) return { status: 'no-event', source: '屏東防災資訊整合平台 119 消息', body: '屏東縣目前沒有公開中的 119 消息。' };
  const matched = rows.find(record => /火|災害|搶救/.test(`${record.type}${record.subtype}`) && emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '屏東防災資訊整合平台 119 消息', body: `${location.city}${location.district || ''}目前沒有公開中的火警或災害搶救案件。` };
  return {
    status: 'live',
    source: '屏東防災資訊整合平台 119 消息',
    body: `${matched.place || location.city}，${matched.type || '消防案件'}，派遣 ${matched.station || '未提供'}，狀態 ${matched.status || '未提供'}，受理 ${matched.time || '時間未提供'}。`,
    shouldNotify: !/返隊|完成|結案/.test(matched.status || '')
  };
}

async function nfaFire(location) {
  const html = await fetchTextAllowInvalidCert(nfaFireInfoUrl, { timeoutMs: 7000 });
  const rows = [...html.matchAll(/<a href="([^"]*article_id=[^"]+)"[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(match => ({
      city: location.city,
      link: match[1].replace(/&amp;/g, '&'),
      title: cleanHtmlText(match[2] || match[3]),
      type: '中央災情訊息',
      subtype: '火災/重大災情',
      place: cleanHtmlText(match[2] || match[3]),
      status: '消防署發布'
    }))
    .filter(record => /火災|氣爆|爆炸|災情|消防人員受傷/.test(record.title));
  if (!rows.length) return { status: 'no-event', source: '內政部消防署災情訊息', body: '消防署目前沒有公開中的火災或重大災情訊息。' };
  const matched = rows.find(record => emergencyMatches(record, location));
  if (!matched) return { status: 'no-event', source: '內政部消防署災情訊息', body: `${location.city}${location.district || ''}目前沒有消防署公開火災或重大災情訊息。` };
  return {
    status: 'live',
    source: '內政部消防署災情訊息',
    body: `${matched.title}。`,
    shouldNotify: false
  };
}

async function fireEmergency(location) {
  const city = canonicalCity(location.city);
  if (city === '臺北市') return taipeiFire({ ...location, city });
  if (city === '基隆市') return keelungFire({ ...location, city });
  if (city === '新竹市') return hsinchuCityFire({ ...location, city });
  if (city === '新竹縣') return hsinchuCountyFire({ ...location, city });
  if (city === '新北市') return newTaipeiFire({ ...location, city });
  if (city === '桃園市') return taoyuanFire({ ...location, city });
  if (city === '臺中市') return taichungFire({ ...location, city });
  if (city === '臺南市') return dtsFire({ ...location, city }, '臺南市政府消防局即時災情');
  if (city === '苗栗縣') return miaoliFire({ ...location, city });
  if (city === '彰化縣') return changhuaFire({ ...location, city });
  if (city === '南投縣') return nantouFire({ ...location, city });
  if (city === '雲林縣') return nfaFire({ ...location, city });
  if (city === '嘉義縣') return chiayiCountyFire({ ...location, city });
  if (city === '嘉義市') return chiayiCityFire({ ...location, city });
  if (city === '高雄市') return dtsFire({ ...location, city }, '高雄市政府消防局即時案件');
  if (city === '宜蘭縣') return dtsFire({ ...location, city }, '宜蘭縣政府消防局 119 即時災情');
  if (city === '屏東縣') return pingtungFire({ ...location, city });
  if (city === '花蓮縣') return nfaFire({ ...location, city });
  if (city === '臺東縣') return nfaFire({ ...location, city });
  if (city === '澎湖縣') return dtsFire({ ...location, city }, '澎湖縣政府消防局即時災情訊息');
  if (city === '金門縣') return nfaFire({ ...location, city });
  if (city === '連江縣') return nfaFire({ ...location, city });
  return genericConfiguredSource({ moduleId: 'fire' }, location);
}

async function fraudAlert() {
  let [tickerData, methodData, advocacyData] = await Promise.all([
    fetchJson(fraudDashboardDefaults.newsTicker, { timeoutMs: 7000, headers: { Referer: 'https://165dashboard.tw/' } }),
    fetchJson(fraudDashboardDefaults.methods, { timeoutMs: 7000, headers: { Referer: 'https://165dashboard.tw/' } }),
    fetchJson(fraudDashboardDefaults.advocacy, { timeoutMs: 7000, headers: { Referer: 'https://165dashboard.tw/' } })
  ]);
  let source = '內政部警政署 165 打詐儀錶板';
  if (!tickerData?.body && !methodData?.body && !advocacyData?.body) {
    const fallback = readFraudDashboardFallback().data || {};
    tickerData = fallback.newsTicker;
    methodData = fallback.methods;
    advocacyData = fallback.advocacy;
    source = '內政部警政署 165 打詐儀錶板快取';
  }
  const ticker = tickerData?.body?.[0];
  const method = methodData?.body?.[0];
  const advocacy = advocacyData?.body?.[0];
  if (!ticker && !method && !advocacy) {
    return { status: 'no-event', source, body: '165 打詐儀錶板資料源暫時無法連線。' };
  }
  const parts = [];
  if (ticker?.NewsTickerTitle) parts.push(`最新防詐提醒：${ticker.NewsTickerTitle}`);
  if (method?.Name) parts.push(`今日常見手法：${method.Name}`);
  if (advocacy?.Name) parts.push(`宣導資源：${advocacy.Name}`);
  return {
    status: 'live',
    source,
    body: parts.join('；') || '165 打詐儀錶板防詐資訊已更新。',
    shouldNotify: false
  };
}

async function crimeWatch(location) {
  const data = await fetchData(npaWomenSafetyUrl, { timeoutMs: 7000 });
  if (!Array.isArray(data) || data.length <= 1) {
    return { status: 'no-event', source: '內政部警政署婦幼安全警示地點', body: '警政署婦幼安全警示地點資料源暫時無法連線。' };
  }
  const records = data.filter(record => record.No !== '編號');
  const city = displayCity(canonicalCity(location.city));
  const district = location.district || '';
  const matched = records.find(record => {
    const text = `${record.Address || ''}${record.DeptNm || ''}${record.BranchNm || ''}`;
    return (!city || text.includes(city) || text.includes(canonicalCity(city))) &&
      (!district || text.includes(district) || text.includes(district.replace(/區|鄉|鎮|市$/, '')));
  }) || records.find(record => `${record.DeptNm || ''}${record.Address || ''}`.includes(city));

  if (!matched) {
    return { status: 'no-event', source: '內政部警政署婦幼安全警示地點', body: `${location.city}${location.district || ''}目前沒有警政署婦幼安全警示地點資料。` };
  }

  return {
    status: 'live',
    source: '內政部警政署婦幼安全警示地點',
    body: `${matched.DeptNm || location.city}${matched.BranchNm ? ` ${matched.BranchNm}` : ''}轄內警示地點：${matched.Address || '地點未提供'}。聯繫窗口：${matched.Contact || '未提供'}${matched.ContactNumber ? `，${matched.ContactNumber}` : ''}。`,
    shouldNotify: false
  };
}

async function gasOutage(location) {
  const data = await fetchData(publicDefaults['gas-work'], { timeoutMs: 7000 });
  if (!Array.isArray(data)) {
    return { status: 'no-event', source: '經濟部能源署災害期間公用天然氣停氣資訊', body: '能源署天然氣停氣資料源暫時無法連線。' };
  }
  const records = data.filter(record => !isEmptyEventRecord(record) && (record['行政區域'] || record['停氣區域'] || record['停氣原因']));
  const matched = records.find(record => matchesLocation(record, location)) || records[0];
  if (!matched) {
    return { status: 'no-event', source: '經濟部能源署災害期間公用天然氣停氣資訊', body: `${location.city}${location.district || ''}目前沒有能源署公告的災害期間天然氣停氣資訊。` };
  }
  return {
    status: 'live',
    source: '經濟部能源署災害期間公用天然氣停氣資訊',
    body: `${matched['行政區域'] || location.city || ''}${matched['停氣區域'] || ''}天然氣停氣：${matched['停氣原因'] || '原因未提供'}，預計修復 ${matched['預計修復時間'] || '未提供'}，事業單位 ${matched['事業單位'] || '未提供'}。`,
    shouldNotify: true
  };
}

async function fatalTrafficAccident(location) {
  const data = await fetchJson(npaFatalTrafficAccidentUrl, { timeoutMs: 7000 });
  const records = data?.result?.records || [];
  if (!records.length) {
    return { status: 'no-event', source: '內政部警政署即時交通事故資料 A1', body: '警政署 A1 交通事故資料源暫時無法連線。' };
  }
  const city = displayCity(canonicalCity(location.city));
  const district = location.district || '';
  const matched = records
    .slice()
    .reverse()
    .find(record => {
      const text = `${record['處理單位名稱警局層'] || ''}${record['發生地點'] || ''}`;
      return (!city || text.includes(city) || text.includes(canonicalCity(city))) &&
        (!district || text.includes(district));
    });

  if (!matched) {
    return { status: 'no-event', source: '內政部警政署即時交通事故資料 A1', body: `${location.city}${location.district || ''}目前沒有警政署公開 A1 重大交通事故資料。` };
  }

  const date = matched['發生日期'] || '';
  const time = `${matched['發生時間'] || ''}`.padStart(6, '0').replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3');
  return {
    status: 'live',
    source: '內政部警政署即時交通事故資料 A1',
    body: `${matched['發生地點'] || location.city} A1 重大交通事故，${matched['死亡受傷人數'] || '傷亡未提供'}，事故型態 ${matched['事故類型及型態子類別名稱'] || '未提供'}，肇因 ${matched['肇因研判子類別名稱-主要'] || '未提供'}${date ? `，時間 ${date} ${time}` : ''}。`,
    shouldNotify: false
  };
}

async function taipeiMetroStatus(location) {
  const text = await fetchText(transitDefaults[canonicalCity(location.city)] || transitDefaults[location.city], { timeoutMs: 7000 });
  if (!text) return { status: 'no-event', source: '臺北捷運營運燈號', body: '臺北捷運營運燈號資料源暫時無法連線。' };
  const statusText = text.match(/realstatus__text[^>]*>([^<]+)</)?.[1]?.trim() || '';
  const link = text.match(/class="abnormal__link" href="([^"]+)"/)?.[1] || '';
  if (!statusText) return { status: 'no-event', source: '臺北捷運營運燈號', body: '臺北捷運營運燈號目前沒有可解析的狀態文字。' };
  if (statusText.includes('正常')) {
    return { status: 'no-event', source: '臺北捷運營運燈號', body: `臺北捷運${statusText}。` };
  }
  return {
    status: 'live',
    source: '臺北捷運營運燈號',
    body: `臺北捷運${statusText}${link ? `，詳情：${link}` : ''}`,
    shouldNotify: true
  };
}

async function thsrStatus() {
  const text = await fetchText(thsrStatusUrl, { timeoutMs: 7000 });
  if (!text) return { status: 'no-event', source: '台灣高鐵列車運行狀況', body: '台灣高鐵列車運行狀況資料源暫時無法連線。' };
  const statusText = text.match(/<div class="text">([\s\S]*?)<\/div>/)?.[1]
    ?.replace(/<[^>]+>/g, '')
    ?.replace(/\s+/g, '')
    ?.trim() || '';
  if (!statusText) return { status: 'no-event', source: '台灣高鐵列車運行狀況', body: '台灣高鐵目前沒有可解析的運行狀態。' };
  if (statusText.includes('正常')) {
    return { status: 'no-event', source: '台灣高鐵列車運行狀況', body: `台灣高鐵${statusText}。` };
  }
  return {
    status: 'live',
    source: '台灣高鐵列車運行狀況',
    body: `台灣高鐵目前狀態：${statusText}，詳情：${thsrStatusUrl}`,
    shouldNotify: true
  };
}

async function traLiveBoard() {
  const records = await fetchJson(traLiveBoardPublicUrl, { timeoutMs: 7000 });
  if (!Array.isArray(records)) {
    return { status: 'no-event', source: 'PTX/MOTC 臺鐵即時到離站', body: '臺鐵即時到離站資料源暫時無法連線。' };
  }
  const delayed = records
    .filter(record => Number(record.DelayTime || 0) >= Number(process.env.TRA_DELAY_NOTIFY_THRESHOLD || 5))
    .sort((a, b) => Number(b.DelayTime || 0) - Number(a.DelayTime || 0));
  if (!delayed.length) {
    return { status: 'no-event', source: 'PTX/MOTC 臺鐵即時到離站', body: '臺鐵目前沒有 5 分鐘以上即時延誤資料。' };
  }
  const record = delayed[0];
  const station = record.StationName?.Zh_tw || record.StationName?.En || record.StationID || '臺鐵車站';
  const trainType = record.TrainTypeName?.Zh_tw || record.TrainTypeName?.En || '列車';
  const ending = record.EndingStationName?.Zh_tw || record.EndingStationName?.En || '目的地未標示';
  return {
    status: 'live',
    source: 'PTX/MOTC 臺鐵即時到離站',
    body: `臺鐵 ${station} 站 ${record.TrainNo || ''} ${trainType} 往 ${ending}，目前延誤 ${record.DelayTime} 分鐘，表定到站 ${record.ScheduledArrivalTime || '未標示'}，更新 ${record.UpdateTime || record.SrcUpdateTime || '未標示'}。`,
    shouldNotify: Number(record.DelayTime || 0) >= Number(process.env.TRA_DELAY_PUSH_THRESHOLD || 10)
  };
}

async function taoyuanMetroStatus(location) {
  const text = await fetchText(taoyuanMetroStatusUrl, { timeoutMs: 7000 });
  if (!text) return { status: 'no-event', source: '桃園捷運最新營運狀態', body: '桃園捷運營運狀態資料源暫時無法連線。' };
  const statusText = text.match(/最新營運狀態[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/)?.[1]
    ?.replace(/<[^>]+>/g, '')
    ?.replace(/\s+/g, '')
    ?.trim() || '';
  if (!statusText) return { status: 'no-event', source: '桃園捷運最新營運狀態', body: '桃園捷運目前沒有可解析的營運狀態。' };
  if (statusText.includes('正常')) {
    return { status: 'no-event', source: '桃園捷運最新營運狀態', body: `桃園捷運${statusText}。` };
  }
  return {
    status: 'live',
    source: '桃園捷運最新營運狀態',
    body: `桃園捷運目前狀態：${statusText}，詳情：${taoyuanMetroStatusUrl}`,
    shouldNotify: true
  };
}

async function taichungMetroStatus() {
  const text = await fetchText(taichungMetroStatusUrl, { timeoutMs: 7000 });
  if (!text) return { status: 'no-event', source: '臺中捷運營運狀態', body: '臺中捷運營運狀態資料源暫時無法連線。' };
  const statusText = cleanHtmlText(text.match(/捷運營運狀態[:：]\s*([\s\S]*?)(?:<\/|票價與乘車時間|<option)/)?.[1] || '');
  if (!statusText) return { status: 'no-event', source: '臺中捷運營運狀態', body: '臺中捷運目前沒有可解析的營運狀態。' };
  if (statusText.includes('正常')) {
    return { status: 'no-event', source: '臺中捷運營運狀態', body: `臺中捷運${statusText}。` };
  }
  return {
    status: 'live',
    source: '臺中捷運營運狀態',
    body: `臺中捷運目前狀態：${statusText}，詳情：${taichungMetroStatusUrl}`,
    shouldNotify: true
  };
}

async function kaohsiungMetroNotice() {
  const text = await fetchText(kaohsiungMetroNoticeUrl, { timeoutMs: 7000 });
  if (!text) return { status: 'no-event', source: '高雄捷運重要公告', body: '高雄捷運重要公告資料源暫時無法連線。' };
  return {
    status: 'no-event',
    source: '高雄捷運重要公告',
    body: '高雄捷運已接入官方重要公告入口；目前未解析到明確營運異常狀態。',
    shouldNotify: false
  };
}

function tdxApiUrl(path, params = {}) {
  const url = new URL(`https://tdx.transportdata.tw/api/basic${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  return url.toString();
}

function ptxApiUrl(path, params = {}) {
  const url = new URL(`https://ptx.transportdata.tw/MOTC${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  return url.toString();
}

function activeWindow(record) {
  const now = Date.now();
  const start = Date.parse(record.StartTime || record.startTime || record.PublishTime || record.publishTime || 0);
  const end = Date.parse(record.EndTime || record.endTime || 0);
  if (Number.isFinite(start) && start > now + 3600000) return false;
  if (Number.isFinite(end) && end < now) return false;
  return true;
}

function scopedTdxRecord(record, location) {
  const text = JSON.stringify(record);
  return !location.district || text.includes(location.district);
}

function trimAlertText(value = '', maxLength = 180) {
  const text = cleanHtmlText(String(value));
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function tdxRoadCategory(rule) {
  if (rule.moduleId === 'roadwork') return {
    ids: new Set([4]),
    keywords: /施工|工程|管制|封閉|改道|鋪面|維修|養護/
  };
  return {
    ids: new Set([2, 3]),
    keywords: /事故|車禍|壅塞|塞車|封閉|障礙|掉落物|故障|事件/
  };
}

async function taipeiRoadwork(location) {
  const city = canonicalCity(location.city);
  if (city !== '臺北市') return { status: 'not-configured', source: '臺北市今日施工資訊' };
  const data = await fetchJson(taipeiTodayRoadworkUrl, { timeoutMs: 7000 });
  const records = Array.isArray(data) ? data : data?.features?.map(feature => feature.properties || feature) || [];
  if (!records.length) return { status: 'no-event', source: '臺北市今日施工資訊', body: '臺北市今日施工資訊資料源暫時無法連線。' };

  const district = location.district || '';
  const matched = records.find(record => (!district || record.C_Name === district || record.Addr?.includes(district)) && !isEmptyEventRecord(record)) ||
    records.find(record => !isEmptyEventRecord(record));
  if (!matched) {
    return { status: 'no-event', source: '臺北市今日施工資訊', body: `${location.city}${district}目前沒有臺北市道路挖掘即時施工通報。` };
  }

  const modeNames = { 0: '施工通報', 3: '銑鋪通報', 4: '搶修通報', 5: '道路維護通報', 6: '人手孔施工通報', B: '建案公設復舊' };
  return {
    status: 'live',
    source: '臺北市今日施工資訊',
    body: `${matched.C_Name || district || '臺北市'}${modeNames[matched.AppMode] || '道路施工'}：${matched.Addr || '位置未標示'}，${matched.WItem || matched.NPurp || '工項未標示'}，施工時間 ${matched.Cb_Da || ''} 至 ${matched.Ce_Da || ''} ${matched.Co_Ti || ''}${matched.IsBlock ? `，影響通行：${matched.IsBlock}` : ''}。`,
    shouldNotify: false
  };
}

function xmlTagValue(block = '', tag) {
  return cleanHtmlText(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '');
}

async function newTaipeiRoadwork(location) {
  const city = canonicalCity(location.city);
  if (city !== '新北市') return { status: 'not-configured', source: '新北市政府道路挖掘資訊' };
  const records = await fetchJson(newTaipeiRoadworkUrl, { timeoutMs: 7000 });
  if (!Array.isArray(records)) return { status: 'no-event', source: '新北市政府道路挖掘資訊', body: '新北市政府道路挖掘資訊資料源暫時無法連線。' };

  const district = location.district || '';
  const matched = records.find(record => (!district || record.district === district || record.digsite?.includes(district)) && !isEmptyEventRecord(record)) ||
    records.find(record => !isEmptyEventRecord(record));
  if (!matched) return { status: 'no-event', source: '新北市政府道路挖掘資訊', body: `${location.city}${district}目前沒有新北市道路挖掘資訊。` };

  return {
    status: 'live',
    source: '新北市政府道路挖掘資訊',
    body: `${matched.district || district || '新北市'}道路挖掘：${matched.constname || matched.casetype || '工程名稱未標示'}，位置 ${matched.digsite || '未標示'}，施工期間 ${matched.casestartdate_yyymmddroc || ''} 至 ${matched.caseenddate_yyymmddroc || ''}，狀態 ${matched.statdesc || '未標示'}。`,
    shouldNotify: false
  };
}

async function taoyuanRoadwork(location) {
  const city = canonicalCity(location.city);
  if (city !== '桃園市') return { status: 'not-configured', source: '桃園市本日道路申挖' };
  const text = await fetchText(taoyuanTodayRoadworkUrl, { timeoutMs: 7000 });
  const district = location.district || '';

  if (text.trim().startsWith('[')) {
    const records = JSON.parse(text);
    const matched = records.find(record => (!district || record.Addtownship === district || record.SLocation?.includes(district)) && !isEmptyEventRecord(record)) ||
      records.find(record => !isEmptyEventRecord(record));
    if (!matched) return { status: 'no-event', source: '桃園市本日道路申挖', body: `${location.city}${district}目前沒有桃園市本日道路申挖資訊。` };
    return {
      status: 'live',
      source: '桃園市本日道路申挖',
      body: `${matched.Addtownship || district || '桃園市'}道路申挖：${matched.ConstName || matched.TypeDetail || '工程名稱未標示'}，位置 ${matched.SLocation || '未標示'}，施工期間 ${matched.Start || ''} 至 ${matched.stop || ''} ${matched.ConstTime || ''}，單位 ${matched.Factory || matched.Supervise || '未標示'}。`,
      shouldNotify: false
    };
  }

  const rows = [...text.matchAll(/<row>([\s\S]*?)<\/row>/gi)].map(match => ({
    district: xmlTagValue(match[1], 'Addtownship'),
    name: xmlTagValue(match[1], 'ConstName'),
    type: xmlTagValue(match[1], 'TypeDetail'),
    location: xmlTagValue(match[1], 'SLocation'),
    start: xmlTagValue(match[1], 'Start'),
    end: xmlTagValue(match[1], 'stop'),
    time: xmlTagValue(match[1], 'ConstTime'),
    unit: xmlTagValue(match[1], 'Factory') || xmlTagValue(match[1], 'Supervise')
  }));
  const matched = rows.find(record => (!district || record.district === district || record.location.includes(district)) && record.location) ||
    rows.find(record => record.location);
  if (!matched) return { status: 'no-event', source: '桃園市本日道路申挖', body: `${location.city}${district}目前沒有桃園市本日道路申挖資訊。` };

  return {
    status: 'live',
    source: '桃園市本日道路申挖',
    body: `${matched.district || district || '桃園市'}道路申挖：${matched.name || matched.type || '工程名稱未標示'}，位置 ${matched.location || '未標示'}，施工期間 ${matched.start || ''} 至 ${matched.end || ''} ${matched.time || ''}，單位 ${matched.unit || '未標示'}。`,
    shouldNotify: false
  };
}

async function tainanRoadwork(location) {
  const city = canonicalCity(location.city);
  if (city !== '臺南市') return { status: 'not-configured', source: '臺南市道路挖掘當日施工資訊' };
  const xml = await fetchText(tainanTodayRoadworkUrl, { timeoutMs: 7000 }) || readTextFallback(tainanRoadworkFile);
  const rows = [...xml.matchAll(/<row>([\s\S]*?)<\/row>/gi)].map(match => ({
    district: xmlTagValue(match[1], 'TOWN_NAME'),
    unit: xmlTagValue(match[1], 'UN_NA'),
    location: xmlTagValue(match[1], 'LOCATION')
  }));
  if (!rows.length) return { status: 'no-event', source: '臺南市道路挖掘當日施工資訊', body: '臺南市道路挖掘當日施工資訊資料源暫時無法連線。' };

  const district = location.district || '';
  const matched = rows.find(record => (!district || record.district === district || record.location.includes(district)) && record.location) ||
    rows.find(record => record.location);
  if (!matched) return { status: 'no-event', source: '臺南市道路挖掘當日施工資訊', body: `${location.city}${district}目前沒有臺南市道路挖掘當日施工資訊。` };

  return {
    status: 'live',
    source: '臺南市道路挖掘當日施工資訊',
    body: `${matched.district || district || '臺南市'}道路挖掘施工：${matched.location || '位置未標示'}，施工/申挖單位 ${matched.unit || '未標示'}。`,
    shouldNotify: false
  };
}

async function kaohsiungRoadwork(location) {
  const city = canonicalCity(location.city);
  if (city !== '高雄市') return { status: 'not-configured', source: '高雄市道路挖掘資訊' };
  const xml = await fetchText(kaohsiungRoadworkUrl, { timeoutMs: 7000 }) || readTextFallback(kaohsiungRoadworkFile);
  const rows = [...xml.matchAll(/<DigCaseInfo\b[^>]*>([\s\S]*?)<\/DigCaseInfo>/gi)].map(match => ({
    district: xmlTagValue(match[1], 'AREA'),
    location: xmlTagValue(match[1], 'LOCATION'),
    company: xmlTagValue(match[1], 'COMPANY'),
    reason: xmlTagValue(match[1], 'REASON'),
    start: xmlTagValue(match[1], 'DATE_DIG_S'),
    end: xmlTagValue(match[1], 'DATE_DIG_E'),
    extendedStart: xmlTagValue(match[1], 'DATE_EXT_S'),
    extendedEnd: xmlTagValue(match[1], 'DATE_EXT_E'),
    result: xmlTagValue(match[1], 'RESULT')
  }));
  if (!rows.length) return { status: 'no-event', source: '高雄市道路挖掘資訊', body: '高雄市道路挖掘資訊資料源暫時無法連線。' };

  const district = location.district || '';
  const matched = rows.find(record => (!district || record.district === district || record.location.includes(district)) && record.location) ||
    rows.find(record => record.location);
  if (!matched) return { status: 'no-event', source: '高雄市道路挖掘資訊', body: `${location.city}${district}目前沒有高雄市道路挖掘資訊。` };

  const start = matched.extendedStart && matched.extendedStart !== '　' ? matched.extendedStart : matched.start;
  const end = matched.extendedEnd && matched.extendedEnd !== '　' ? matched.extendedEnd : matched.end;
  return {
    status: 'live',
    source: '高雄市道路挖掘資訊',
    body: `${matched.district || district || '高雄市'}道路挖掘：${matched.reason || '施工原因未標示'}，位置 ${matched.location || '未標示'}，施工期間 ${start || ''} 至 ${end || ''}，單位 ${matched.company || '未標示'}。`,
    shouldNotify: false
  };
}

function parseMaybeJsonString(text = '') {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch {
    return [];
  }
}

function htmlTableValue(html = '', label) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const row of rows) {
    const th = cleanHtmlText(row[1].match(/<th\b[^>]*>([\s\S]*?)<\/th>/i)?.[1] || '');
    if (th !== label) continue;
    return cleanHtmlText(row[1].match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '');
  }
  return '';
}

async function publicPipeRoadwork(location, config) {
  const city = canonicalCity(location.city);
  if (city !== config.city) return { status: 'not-configured', source: config.source };
  let records = [];
  for (const type of ['3', '4']) {
    const text = await fetchText(`${config.baseUrl}/Home/Get_AppNoXY?type=${type}`, { timeoutMs: 7000 });
    const items = parseMaybeJsonString(text);
    if (Array.isArray(items)) records.push(...items.map(item => ({ ...item, type })));
  }
  if (!records.length && config.cacheFile) {
    records = readJsonFallback(config.cacheFile, { records: [] })?.records || [];
  }
  if (!records.length) return { status: 'no-event', source: config.source, body: `${location.city}${location.district || ''}目前沒有${config.shortName}今日施工或緊急搶修資訊。` };

  const district = location.district || '';
  const candidates = district ? records.slice(0, 40) : records.slice(0, 1);
  for (const record of candidates) {
    const html = record.address ? '' : await fetchText(`${config.baseUrl}/Home/DetailsBox?id=${encodeURIComponent(record.AppNo)}`, { timeoutMs: 7000 });
    const address = record.address || htmlTableValue(html, '地址');
    const note = record.note || htmlTableValue(html, '備註');
    if (district && !address.includes(district) && !note.includes(district)) continue;
    const status = record.statusText || htmlTableValue(html, '案件進度') || (record.type === '4' ? '緊急搶修案件' : '今日施工');
    const owner = record.owner || htmlTableValue(html, '路權單位');
    const unit = record.unit || htmlTableValue(html, '申請單位') || record.AppUnitName;
    const start = record.start || htmlTableValue(html, '核准開挖日期起') || htmlTableValue(html, '申請開挖日期起');
    const end = record.end || htmlTableValue(html, '核准開挖日期止') || htmlTableValue(html, '申請開挖日期止');
    return {
      status: 'live',
      source: config.source,
      body: `${district || config.shortName}道路挖掘${record.type === '4' ? '緊急搶修' : '施工'}：${address || note || '位置未標示'}，期間 ${start || ''} 至 ${end || ''}，單位 ${unit || '未標示'}，路權 ${owner || '未標示'}，狀態 ${status || '未標示'}。`,
      shouldNotify: record.type === '4'
    };
  }

  return { status: 'no-event', source: config.source, body: `${location.city}${district}目前沒有${config.shortName}道路挖掘資訊。` };
}

async function nantouRoadwork(location) {
  return publicPipeRoadwork(location, {
    city: '南投縣',
    source: '南投縣政府管線挖掘資訊便民服務系統',
    shortName: '南投縣',
    baseUrl: nantouRoadworkBaseUrl,
    cacheFile: nantouRoadworkFile
  });
}

async function yunlinRoadwork(location) {
  return publicPipeRoadwork(location, {
    city: '雲林縣',
    source: '雲林縣政府管線挖掘資訊便民服務系統',
    shortName: '雲林縣',
    baseUrl: yunlinRoadworkBaseUrl,
    cacheFile: yunlinRoadworkFile
  });
}

async function pingtungRoadwork(location) {
  const city = canonicalCity(location.city);
  if (city !== '屏東縣') return { status: 'not-configured', source: '屏東縣道路挖掘施工資訊' };
  const xml = await fetchText(pingtungRoadworkUrl, { timeoutMs: 15000 }) || readTextFallback(pingtungRoadworkFile);
  const rows = [...xml.matchAll(/<屏東縣道路挖掘施工案件[^>]*>([\s\S]*?)<\/屏東縣道路挖掘施工案件>/gi)].map(match => ({
    unit: xmlTagValue(match[1], '申請單位'),
    owner: xmlTagValue(match[1], '核准機關'),
    reason: xmlTagValue(match[1], '施工原因'),
    location: xmlTagValue(match[1], '挖掘地點'),
    permit: xmlTagValue(match[1], '道路挖掘許可證字號'),
    start: xmlTagValue(match[1], '核准施工起始日期'),
    end: xmlTagValue(match[1], '核准施工終止日期')
  }));
  if (!rows.length) return { status: 'no-event', source: '屏東縣道路挖掘施工資訊', body: '屏東縣道路挖掘施工資訊資料源暫時無法連線。' };

  const district = location.district || '';
  const matched = rows.find(record => (!district || record.location.includes(district)) && record.location) ||
    rows.find(record => record.location);
  if (!matched) return { status: 'no-event', source: '屏東縣道路挖掘施工資訊', body: `${location.city}${district}目前沒有屏東縣道路挖掘施工資訊。` };

  return {
    status: 'live',
    source: '屏東縣道路挖掘施工資訊',
    body: `${district || '屏東縣'}道路挖掘施工：${matched.reason || '施工原因未標示'}，位置 ${matched.location || '未標示'}，期間 ${matched.start || ''} 至 ${matched.end || ''}，單位 ${matched.unit || '未標示'}，許可 ${matched.permit || '未標示'}。`,
    shouldNotify: false
  };
}

function taiwanDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function kinmenRoadwork(location) {
  const city = canonicalCity(location.city);
  if (city !== '金門縣') return { status: 'not-configured', source: '金門縣道路挖掘管理系統' };
  const url = `${kinmenApprovedRoadworkBaseUrl}?date=${taiwanDateString()}&keyword=`;
  const data = await fetchJson(url, { timeoutMs: 7000 });
  const records = Array.isArray(data?.Data) ? data.Data : [];
  if (!records.length) return { status: 'no-event', source: '金門縣道路挖掘管理系統', body: `${location.city}${location.district || ''}目前沒有金門縣道路挖掘當日已核定或施工中資料。` };

  const district = location.district || '';
  const matched = records.find(record => (!district || record.Road?.includes(district) || record.EngUse?.includes(district)) && !isEmptyEventRecord(record)) ||
    records.find(record => !isEmptyEventRecord(record));
  if (!matched) return { status: 'no-event', source: '金門縣道路挖掘管理系統', body: `${location.city}${district}目前沒有金門縣道路挖掘當日已核定或施工中資料。` };

  return {
    status: 'live',
    source: '金門縣道路挖掘管理系統',
    body: `${district || '金門縣'}道路挖掘：${matched.EngUse || '工程名稱未標示'}，位置 ${matched.Road || '未標示'}，期間 ${matched.AllowStart || ''} 至 ${matched.AllowStop || ''}，單位 ${matched.PPName || '未標示'}，狀態 ${matched.Status || matched.CaseType || '未標示'}。`,
    shouldNotify: false
  };
}

async function yilanRoadwork(location) {
  const city = canonicalCity(location.city);
  if (city !== '宜蘭縣') return { status: 'not-configured', source: '宜蘭縣道路挖掘管理資訊' };
  const xml = await fetchText(yilanRoadworkUrl, { timeoutMs: 7000 }) || readTextFallback(yilanRoadworkFile);
  const rows = [...xml.matchAll(/<CASE_DETAIL\b[^>]*>([\s\S]*?)<\/CASE_DETAIL>/gi)].map(match => ({
    district: xmlTagValue(match[1], 'TOWN_NAME'),
    name: xmlTagValue(match[1], 'CONST_NAME'),
    location: xmlTagValue(match[1], 'LOCATION'),
    start: xmlTagValue(match[1], 'ABE_DA'),
    end: xmlTagValue(match[1], 'AEN_DA'),
    time: xmlTagValue(match[1], 'DACO_TI'),
    unit: xmlTagValue(match[1], 'UN_NA')
  }));
  if (!rows.length) return { status: 'no-event', source: '宜蘭縣道路挖掘管理資訊', body: '宜蘭縣道路挖掘管理資訊資料源暫時無法連線。' };

  const district = location.district || '';
  const matched = rows.find(record => (!district || record.district === district || record.location.includes(district)) && record.location) ||
    rows.find(record => record.location);
  if (!matched) return { status: 'no-event', source: '宜蘭縣道路挖掘管理資訊', body: `${location.city}${district}目前沒有宜蘭縣道路挖掘資訊。` };

  return {
    status: 'live',
    source: '宜蘭縣道路挖掘管理資訊',
    body: `${matched.district || district || '宜蘭縣'}道路挖掘：${matched.name || '工程名稱未標示'}，位置 ${matched.location || '未標示'}，施工期間 ${matched.start || ''} 至 ${matched.end || ''} ${matched.time || ''}，單位 ${matched.unit || '未標示'}。`,
    shouldNotify: false
  };
}

async function cityRoadNews(rule, location) {
  const cityCode = tdxCityCodeFor(location);
  if (!cityCode) return { status: 'not-configured', source: 'TDX 城市道路交通消息' };
  const data = await fetchTdx(tdxApiUrl(`/v2/Road/Traffic/Live/News/City/${cityCode}`, { $top: '50', $format: 'JSON' }));
  if (data?.status === 'not-configured') return data;
  if (!data) return { status: 'no-event', source: 'TDX 城市道路交通消息', body: `${location.city}${location.district || ''}地方道路交通資料源暫時無法連線。` };

  const category = tdxRoadCategory(rule);
  const records = (data.Newses || data.newses || extractRecords(data))
    .filter(record => activeWindow(record))
    .filter(record => category.ids.has(Number(record.NewsCategory)) || category.keywords.test(`${record.Title || ''}${record.Description || ''}`))
    .filter(record => scopedTdxRecord(record, location));

  if (!records.length) {
    return { status: 'no-event', source: 'TDX 城市道路交通消息', body: `${location.city}${location.district || ''}目前沒有地方道路${rule.moduleId === 'roadwork' ? '施工' : '事故'}通報。` };
  }

  const record = records[0];
  const timeText = [record.StartTime, record.EndTime].filter(Boolean).join(' 至 ');
  return {
    status: 'live',
    source: 'TDX 城市道路交通消息',
    body: `${record.Title || '地方道路交通事件'}${timeText ? `（${timeText}）` : ''}：${trimAlertText(record.Description || record.NewsURL || '')}`,
    shouldNotify: rule.moduleId === 'road-incident'
  };
}

function busStatusText(status) {
  if (status === 0) return '全部營運停止';
  if (status === 1) return '全部營運正常';
  if (status === 2) return '有異常狀況';
  return '狀態未標示';
}

async function tdxBusAlerts(location) {
  const cityCode = tdxCityCodeFor(location);
  const cityPromise = cityCode
    ? fetchTdx(tdxApiUrl(`/v2/Bus/Alert/City/${cityCode}`, { $top: '50', $format: 'JSON' }))
    : Promise.resolve(null);
  const [cityData, interCityData] = await Promise.all([
    cityPromise,
    fetchTdx(tdxApiUrl('/v2/Bus/Alert/InterCity', { $top: '50', $format: 'JSON' }))
  ]);
  if (cityData?.status === 'not-configured' || interCityData?.status === 'not-configured') {
    return { status: 'not-configured', source: 'TDX 公車/客運營運通阻' };
  }
  if (!cityData && !interCityData) return { status: 'no-event', source: 'TDX 公車/客運營運通阻', body: '公車/客運營運通阻資料源暫時無法連線。' };

  const records = [
    ...(Array.isArray(cityData) ? cityData : extractRecords(cityData)),
    ...(Array.isArray(interCityData) ? interCityData : extractRecords(interCityData))
  ]
    .filter(record => activeWindow(record))
    .filter(record => Number(record.Status) !== 1)
    .filter(record => scopedTdxRecord(record, location));

  if (!records.length) {
    return { status: 'no-event', source: 'TDX 公車/客運營運通阻', body: `${location.city}${location.district || ''}目前沒有公車或公路客運營運通阻事件。` };
  }

  const record = records[0];
  const routes = record.Scope?.Routes?.map(route => route.RouteName?.Zh_tw || route.RouteName?.En || route.RouteID).filter(Boolean).slice(0, 4).join('、');
  const timeText = [record.StartTime, record.EndTime].filter(Boolean).join(' 至 ');
  return {
    status: 'live',
    source: 'TDX 公車/客運營運通阻',
    body: `${routes ? `${routes}：` : ''}${record.Title || '公車/客運營運異常'}，${busStatusText(record.Status)}${timeText ? `（${timeText}）` : ''}。${trimAlertText(record.Description || record.AlertURL || '')}`,
    shouldNotify: true
  };
}

async function ptxBusAlerts(location) {
  const cityCode = tdxCityCodeFor(location);
  const cityPromise = cityCode
    ? fetchJson(ptxApiUrl(`/v2/Bus/Alert/City/${cityCode}`, { $top: '50', $format: 'JSON' }), { timeoutMs: 7000 })
    : Promise.resolve(null);
  const [cityData, interCityData] = await Promise.all([
    cityPromise,
    fetchJson(ptxApiUrl('/v2/Bus/Alert/InterCity', { $top: '50', $format: 'JSON' }), { timeoutMs: 7000 })
  ]);
  if (!cityData && !interCityData) return { status: 'no-event', source: 'PTX/MOTC 公車/客運營運通阻', body: '公車/客運營運通阻資料源暫時無法連線。' };

  const records = [
    ...(Array.isArray(cityData) ? cityData : extractRecords(cityData)),
    ...(Array.isArray(interCityData) ? interCityData : extractRecords(interCityData))
  ]
    .filter(record => activeWindow(record))
    .filter(record => Number(record.Status) !== 1)
    .filter(record => scopedTdxRecord(record, location));

  if (!records.length) {
    return { status: 'no-event', source: 'PTX/MOTC 公車/客運營運通阻', body: `${location.city}${location.district || ''}目前沒有公車或公路客運營運通阻事件。` };
  }

  const record = records[0];
  const routes = record.Scope?.Routes?.map(route => route.RouteName?.Zh_tw || route.RouteName?.En || route.RouteID).filter(Boolean).slice(0, 4).join('、');
  const timeText = [record.StartTime, record.EndTime].filter(Boolean).join(' 至 ');
  return {
    status: 'live',
    source: 'PTX/MOTC 公車/客運營運通阻',
    body: `${routes ? `${routes}：` : ''}${record.Title || '公車/客運營運異常'}，${busStatusText(record.Status)}${timeText ? `（${timeText}）` : ''}。${trimAlertText(record.Description || record.AlertURL || '')}`,
    shouldNotify: true
  };
}

async function officialLocalBulletin(location) {
  const city = canonicalCity(location.city);
  const config = localBulletinDefaults[city] || localBulletinDefaults[location.city];
  if (!config) return genericConfiguredSource({ moduleId: 'local-bulletin' }, location);

  const html = await fetchText(config.info, { timeoutMs: 7000 });
  const title = cleanHtmlText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || config.label || `${city}政府公告`);
  const snippets = [...html.matchAll(/<(?:a|h1|h2|h3|li|p)[^>]*>([\s\S]*?(?:公告|新聞|活動|市政|縣政|施政|訊息)[\s\S]*?)<\/(?:a|h1|h2|h3|li|p)>/gi)]
    .map(match => cleanHtmlText(match[1]))
    .filter(text => text && text.length >= 4 && text.length <= 120)
    .filter((text, index, array) => array.indexOf(text) === index)
    .slice(0, 3);

  return {
    status: 'live',
    source: config.label || title,
    body: snippets.length
      ? `${city}${location.district || ''}已接入官方地方公告入口：${snippets.join('；')}。`
      : `${city}${location.district || ''}已接入官方地方公告入口：${config.summary || title}`,
    shouldNotify: false
  };
}

async function transitInfo(location) {
  const city = canonicalCity(location.city);
  const highSpeedRail = await thsrStatus();
  if (highSpeedRail.status === 'live') return highSpeedRail;
  const railIncident = await ncdrCapAlert('transit', location);
  if (railIncident.status === 'live') return railIncident;
  const traBoard = await traLiveBoard();
  if (traBoard.status === 'live') return traBoard;
  const tdxBusAlert = await tdxBusAlerts({ ...location, city });
  const busAlert = tdxBusAlert.status === 'not-configured' ? await ptxBusAlerts({ ...location, city }) : tdxBusAlert;
  if (busAlert.status === 'live') return busAlert;
  if (city === '桃園市') return taoyuanMetroStatus({ ...location, city });
  if (city === '臺中市') return taichungMetroStatus();
  if (city === '臺北市' || city === '新北市') return taipeiMetroStatus({ ...location, city });
  if (city === '高雄市') return kaohsiungMetroNotice();
  if (busAlert.status !== 'not-configured') return busAlert;
  if (traBoard.status !== 'not-configured') return traBoard;
  if (railIncident.status !== 'not-configured') return railIncident;
  if (highSpeedRail.status !== 'not-configured') return highSpeedRail;
  return genericConfiguredSource({ moduleId: 'transit' }, location);
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

  if (tdxTokenCache?.accessToken && tdxTokenCache.expiresAt > Date.now() + 30000) {
    return fetchJson(url, { headers: { Authorization: `Bearer ${tdxTokenCache.accessToken}` }, timeoutMs: 7000 });
  }

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
  if (!token?.access_token) return null;
  tdxTokenCache = {
    accessToken: token.access_token,
    expiresAt: Date.now() + (Number(token.expires_in || 3600) * 1000)
  };
  return fetchJson(url, { headers: { Authorization: `Bearer ${token.access_token}` }, timeoutMs: 7000 });
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

async function fetchCwaTownForecast(location) {
  const city = canonicalCity(location.city || '臺北市');
  const datasetId = cwaTownForecastDatasetIds[city];
  if (!datasetId) return null;

  const cached = cwaTownForecastCache[datasetId];
  if (cached?.loadedAt > Date.now() - 30 * 60 * 1000) return cached.data;

  const search = new URLSearchParams({ Authorization: cwaPublicFileKey, format: 'JSON' });
  const data = await fetchJson(`${cwaTownForecastBaseUrl}/${datasetId}?${search}`, { timeoutMs: 7000 });
  if (data?.cwaopendata?.Dataset) {
    cwaTownForecastCache[datasetId] = { data, loadedAt: Date.now() };
  }
  return data;
}

function cwaTownLocation(data, location) {
  const locations = data?.cwaopendata?.Dataset?.Locations;
  const places = Array.isArray(locations) ? locations.flatMap(group => group.Location || []) : locations?.Location || [];
  const district = location.district || '';
  return places.find(place => place.LocationName === district) ||
    places.find(place => district && (place.LocationName?.includes(district) || district.includes(place.LocationName))) ||
    places[0];
}

function townWeatherValue(place, elementName, valueName) {
  const value = place?.WeatherElement?.find(element => element.ElementName === elementName)?.Time?.[0]?.ElementValue;
  return value?.[valueName] || Object.values(value || {})[0];
}

async function cwaTownForecast(rule, location) {
  const city = canonicalCity(location.city || '臺北市');
  const data = await fetchCwaTownForecast(location);
  const place = cwaTownLocation(data, location);
  const placeName = `${displayCity(city)}${place?.LocationName || location.district || ''}`;
  if (!place) {
    return { status: 'no-event', source: 'CWA F-D0047 鄉鎮預報公開檔', body: `${placeName}目前沒有可用的鄉鎮天氣預報資料。` };
  }

  const rain = townWeatherValue(place, '3小時降雨機率', 'ProbabilityOfPrecipitation');
  const temp = townWeatherValue(place, '溫度', 'Temperature');
  const weather = townWeatherValue(place, '天氣現象', 'Weather');
  const description = townWeatherValue(place, '天氣預報綜合描述', 'WeatherDescription');

  if (rule.moduleId === 'rain' && rain) {
    return {
      status: 'live',
      source: 'CWA F-D0047 鄉鎮預報公開檔',
      body: `${placeName}未來 3 小時降雨機率 ${rain}%，天氣${weather || '已更新'}。`,
      shouldNotify: Number(rain) >= Number(process.env.RAIN_NOTIFY_THRESHOLD || 50)
    };
  }

  if (rule.moduleId === 'temperature' && temp) {
    return {
      status: 'live',
      source: 'CWA F-D0047 鄉鎮預報公開檔',
      body: `${placeName}目前預報溫度約 ${temp} 度${description ? `，${description}` : ''}`,
      shouldNotify: true
    };
  }

  return { status: 'no-event', source: 'CWA F-D0047 鄉鎮預報公開檔', body: `${placeName}目前沒有可用的鄉鎮天氣預報資料。` };
}

async function fetchCwaPublicFile(datasetId, maxAgeMs = 30 * 60 * 1000) {
  const cached = cwaPublicFileCache[datasetId];
  if (cached?.loadedAt > Date.now() - maxAgeMs) return cached.data;

  const search = new URLSearchParams({ Authorization: cwaPublicFileKey, format: 'JSON' });
  const data = await fetchJson(`${cwaTownForecastBaseUrl}/${datasetId}?${search}`, { timeoutMs: 7000 });
  if (data?.cwaopendata) cwaPublicFileCache[datasetId] = { data, loadedAt: Date.now() };
  return data;
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

function earthquakeIntensityFor(earthquake, location) {
  const counties = earthquake?.Intensity?.County || [];
  const city = canonicalCity(location.city || '');
  const county = counties.find(item => sameCity(item.CountyName, city)) || counties[0];
  const district = location.district || '';
  const towns = county?.Town || [];
  const town = towns.find(item => item.TownName === district) ||
    towns.find(item => district && (item.TownName?.includes(district) || district.includes(item.TownName)));
  return {
    countyName: county?.CountyName,
    countyIntensity: county?.CountyMaxIntensity,
    townName: town?.TownName,
    townIntensity: town?.StationIntensity
  };
}

async function cwaEarthquakePublic(location) {
  const data = await fetchCwaPublicFile('E-A0015-005', 5 * 60 * 1000);
  const earthquake = data?.cwaopendata?.Earthquake;
  if (!earthquake) return { status: 'no-event', source: 'CWA E-A0015-005 公開鄉鎮震度', body: '目前沒有中央氣象署公開鄉鎮震度資料。' };

  const intensity = earthquakeIntensityFor(earthquake, location);
  const magnitude = earthquake.Magnitude?.MagnitudeValue;
  const depth = earthquake.FocalDepth;
  const placeText = intensity.townName
    ? `${intensity.countyName}${intensity.townName}震度 ${intensity.townIntensity || intensity.countyIntensity || '未標示'}`
    : intensity.countyName
      ? `${intensity.countyName}最大震度 ${intensity.countyIntensity || '未標示'}`
      : '各地震度請參考中央氣象署資料';
  const originTime = earthquake.OriginTime || data?.cwaopendata?.sent;
  const recent = Date.now() - Date.parse(originTime || 0) < 24 * 60 * 60 * 1000;

  return {
    status: 'live',
    source: 'CWA E-A0015-005 公開鄉鎮震度',
    body: `${earthquake.Description || '中央氣象署地震資料'}${originTime ? `（${originTime}）` : ''}，規模 ${magnitude || '未標示'}、深度 ${depth || '未標示'} 公里，${placeText}。`,
    shouldNotify: recent
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

async function cwaTyphoonPublic() {
  const data = await fetchCwaPublicFile('W-C0034-005');
  const records = data?.cwaopendata?.Dataset?.TropicalCyclones?.TropicalCyclone || [];
  const items = Array.isArray(records) ? records : [records].filter(Boolean);
  if (items.length === 0) {
    return { status: 'no-event', source: 'CWA W-C0034-005 公開颱風資料', body: '目前沒有中央氣象署發布中的颱風資料。' };
  }
  const item = items[0];
  const fix = item?.AnalysisData?.Fix || {};
  const name = item?.CwaTyphoonName || item?.TyphoonName || (item?.CwaTdNo ? `熱帶性低氣壓 ${item.CwaTdNo}` : '颱風');
  const movement = Array.isArray(fix.MovingPrediction) ? fix.MovingPrediction.find(entry => entry['@lang'] === 'zh-hant')?.['#text'] : fix.MovingPrediction?.['#text'];
  const time = fix.DateTime || data?.cwaopendata?.Sent;
  return {
    status: 'live',
    source: 'CWA W-C0034-005 公開颱風資料',
    body: `中央氣象署${time ? ` ${time}` : ''} 發布 ${name} 資料，中心位置約北緯 ${fix.CoordinateLatitude || '?'} 度、東經 ${fix.CoordinateLongitude || '?'} 度${movement ? `，${movement}` : ''}。`,
    shouldNotify: true
  };
}

async function moenvAqi(location) {
  const keys = [process.env.MOENV_API_KEY || process.env.EPA_API_KEY, ...moenvPublicAqiKeys].filter(Boolean);
  let data = null;
  let source = 'MOENV AQX_P_432';
  for (const key of keys) {
    data = await fetchJson(`https://data.moenv.gov.tw/api/v2/aqx_p_432?api_key=${encodeURIComponent(key)}&format=json&limit=1000&sort=ImportDate%20desc`, { timeoutMs: 7000 });
    const records = Array.isArray(data) ? data : data?.records;
    if (records?.length) {
      if (key !== process.env.MOENV_API_KEY && key !== process.env.EPA_API_KEY) source = 'MOENV AQX_P_432 公開 JSON 檢視';
      break;
    }
  }
  const records = Array.isArray(data) ? data : data?.records || [];
  if (!records.length) return { status: 'not-configured', source: 'MOENV AQX_P_432' };
  const matched = records.find(record => sameCity(record.county, location.city)) || records[0];
  if (!matched?.aqi) return { status: 'no-event', source: 'MOENV AQX_P_432', body: `${location.city || '所在地'}目前沒有可用 AQI 資料。` };
  return {
    status: 'live',
    source,
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
    if (result.status !== 'not-configured') return result;
    const publicForecast = await cwaTownForecast(rule, location);
    return publicForecast.status === 'live' ? publicForecast : ncdrCapAlert(rule.moduleId, location);
  }
  if (rule.moduleId === 'earthquake') {
    const result = await cwaEarthquake(location);
    if (result.status !== 'not-configured') return result;
    const publicEarthquake = await cwaEarthquakePublic(location);
    return publicEarthquake.status === 'live' ? publicEarthquake : ncdrCapAlert(rule.moduleId, location);
  }
  if (rule.moduleId === 'typhoon') {
    const result = await cwaTyphoon(location);
    if (result.status !== 'not-configured') return result;
    const publicTyphoon = await cwaTyphoonPublic();
    return publicTyphoon.status === 'live' ? publicTyphoon : ncdrCapAlert(rule.moduleId, location);
  }
  if (rule.moduleId === 'air-quality') return moenvAqi(location);
  if (['road-incident', 'roadwork'].includes(rule.moduleId)) {
    let localRoadworkNoEvent = null;
    if (rule.moduleId === 'roadwork') {
      for (const source of [taipeiRoadwork, newTaipeiRoadwork, taoyuanRoadwork, nantouRoadwork, yunlinRoadwork, tainanRoadwork, kaohsiungRoadwork, pingtungRoadwork, yilanRoadwork, kinmenRoadwork]) {
        const localRoadwork = await source(location);
        if (localRoadwork.status === 'live') return localRoadwork;
        if (localRoadwork.status === 'no-event' && !localRoadworkNoEvent) localRoadworkNoEvent = localRoadwork;
      }
    }
    const localRoad = await cityRoadNews(rule, location);
    if (localRoad.status === 'live') return localRoad;
    if (localRoadworkNoEvent) return localRoadworkNoEvent;
    const freeway = await freewayLiveEvent(rule, location);
    if (freeway.status === 'live') return freeway;
    return localRoad.status !== 'not-configured' ? localRoad : freeway;
  }
  if (rule.moduleId === 'commute') return freewayLiveEvent(rule, location);
  if (rule.moduleId === 'transit') return transitInfo(location);
  if (rule.moduleId === 'parking') return parkingInfo(location);
  if (rule.moduleId === 'fire') return fireEmergency(location);
  if (rule.moduleId === 'fraud-alert') return fraudAlert();
  if (rule.moduleId === 'crime-watch') return crimeWatch(location);
  if (rule.moduleId === 'gas-work') return gasOutage(location);
  if (rule.moduleId === 'garbage-truck' && canonicalCity(location.city) === '桃園市') return taoyuanGarbage(location);
  if (rule.moduleId === 'garbage-truck' && hinetRegionIdFor(location)) return (await hinetGarbage(location)) || moenvRouteFallback(location);
  if (rule.moduleId === 'local-bulletin') {
    const result = await ncdrCapAlert(rule.moduleId, location);
    return result.status === 'live' ? result : officialLocalBulletin(location);
  }
  if (rule.moduleId === 'accident') {
    const result = await ncdrCapAlert(rule.moduleId, location);
    return result.status === 'live' ? result : fatalTrafficAccident(location);
  }
  if (rule.moduleId === 'evacuation') {
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
      'gas-outage': {
        coverage: '全台灣災害期間公用天然氣停氣資訊',
        modules: ['gas-work'],
        source: publicDefaults['gas-work']
      },
      'npa-women-safety': {
        coverage: '全台灣婦幼安全警示地點',
        modules: ['crime-watch'],
        source: npaWomenSafetyUrl
      },
      'npa-fatal-traffic-accidents': {
        coverage: '全台灣 A1 重大交通事故公開資料',
        modules: ['accident'],
        source: npaFatalTrafficAccidentUrl
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
        modules: ['rain', 'temperature', 'earthquake', 'typhoon', 'transit', 'evacuation', 'local-bulletin', 'accident'],
        source: 'https://alerts.ncdr.nat.gov.tw/JSONAtomFeed.ashx'
      },
      'cwa-town-forecast-public': {
        coverage: Object.keys(cwaTownForecastDatasetIds),
        modules: ['rain', 'temperature'],
        source: `${cwaTownForecastBaseUrl}/{datasetId}?Authorization=${cwaPublicFileKey}&format=JSON`
      },
      'cwa-typhoon-public': {
        coverage: '西北太平洋颱風與熱帶性低氣壓路徑資料',
        modules: ['typhoon'],
        source: `${cwaTownForecastBaseUrl}/W-C0034-005?Authorization=${cwaPublicFileKey}&format=JSON`
      },
      'cwa-earthquake-public': {
        coverage: '全台灣鄉鎮震度',
        modules: ['earthquake'],
        source: `${cwaTownForecastBaseUrl}/E-A0015-005?Authorization=${cwaPublicFileKey}&format=JSON`
      },
      'freeway-live-events': {
        coverage: '全台灣國道即時事件',
        modules: ['commute', 'road-incident', 'roadwork'],
        source: 'https://tisvcloud.freeway.gov.tw/history/motc20/LiveEvents.xml'
      },
      'tdx-city-road-news': {
        coverage: Object.keys(tdxCitySourceNames),
        modules: ['road-incident', 'roadwork'],
        source: 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Live/News/City/{City}'
      },
      'taipei-roadwork-today': {
        coverage: '臺北市道路挖掘即時施工通報',
        modules: ['roadwork'],
        source: taipeiTodayRoadworkUrl
      },
      'local-roadwork-public': {
        coverage: ['新北市', '桃園市', '南投縣', '雲林縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '金門縣'],
        modules: ['roadwork'],
        sources: {
          新北市: newTaipeiRoadworkUrl,
          桃園市: taoyuanTodayRoadworkUrl,
          南投縣: `${nantouRoadworkBaseUrl}/Home/Get_AppNoXY?type=3`,
          雲林縣: `${yunlinRoadworkBaseUrl}/Home/Get_AppNoXY?type=3`,
          臺南市: tainanTodayRoadworkUrl,
          高雄市: kaohsiungRoadworkUrl,
          屏東縣: pingtungRoadworkUrl,
          宜蘭縣: yilanRoadworkUrl,
          金門縣: `${kinmenApprovedRoadworkBaseUrl}?date={YYYY-MM-DD}&keyword=`
        }
      },
      'tdx-bus-alerts': {
        coverage: [...Object.keys(tdxCitySourceNames), '公路客運'],
        modules: ['transit'],
        source: 'https://tdx.transportdata.tw/api/basic/v2/Bus/Alert/City/{City} + /v2/Bus/Alert/InterCity'
      },
      'ptx-bus-alerts-public': {
        coverage: [...Object.keys(tdxCitySourceNames), '公路客運'],
        modules: ['transit'],
        source: `${ptxBusAlertBaseUrl}/City/{City}?$format=JSON + ${ptxBusAlertBaseUrl}/InterCity?$format=JSON`
      },
      'local-bulletin-portals': {
        coverage: Object.keys(Object.fromEntries(Object.keys(localBulletinDefaults).map(city => [canonicalCity(city), true]))),
        modules: ['local-bulletin'],
        sources: Object.fromEntries(Object.entries(localBulletinDefaults).map(([city, config]) => [city, config.info]))
      },
      parking: {
        coverage: Object.keys(parkingDefaults),
        sources: parkingDefaults
      },
      fire: {
        coverage: Object.keys(fireDefaults),
        sources: fireDefaults
      },
      transit: {
        coverage: Object.keys(transitDefaults),
        sources: transitDefaults
      },
      'high-speed-rail-status': {
        coverage: '全台灣高鐵列車運行狀況',
        modules: ['transit'],
        source: thsrStatusUrl
      },
      'tra-live-board-public': {
        coverage: '全台灣臺鐵列車即時到離站與延誤',
        modules: ['transit'],
        source: traLiveBoardPublicUrl
      },
      'taoyuan-metro-status': {
        coverage: '桃園捷運營運狀態',
        modules: ['transit'],
        source: taoyuanMetroStatusUrl
      },
      'taichung-metro-status': {
        coverage: '臺中捷運營運狀態',
        modules: ['transit'],
        source: taichungMetroStatusUrl
      },
      'kaohsiung-metro-notice': {
        coverage: '高雄捷運重要公告',
        modules: ['transit'],
        source: kaohsiungMetroNoticeUrl
      },
      'fraud-dashboard': {
        coverage: '全台灣防詐宣導與今日常見手法',
        modules: ['fraud-alert'],
        sources: fraudDashboardDefaults
      },
      'moenv-aqi': {
        coverage: '全台灣空氣品質測站',
        modules: ['air-quality'],
        source: 'https://data.gov.tw/dataset/40448'
      }
    },
    keyRequired: {
      cwa: [],
      moenv: [],
      tdx: ['road-incident', 'roadwork']
    },
    configurable: Object.keys(moduleEnvNames).filter(moduleId => !publicDefaults[moduleId] && moduleId !== 'garbage-truck')
  };
}
