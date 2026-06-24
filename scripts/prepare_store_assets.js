const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'store_assets', '20260623');
const SCREEN_DIR = path.join(OUT, 'screenshots', 'iphone-6-7');
const GP_DIR = path.join(OUT, 'google-play');
const DOC_DIR = path.join(OUT, 'docs');
const PORT = 8067;
const BASE = `http://127.0.0.1:${PORT}`;

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, content) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, content);
}

async function api(token, url, options = {}) {
  const res = await fetch(BASE + url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${url}: ${JSON.stringify(data)}`);
  return data;
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch (e) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw new Error('local server did not start');
}

async function createDeviceUser(name, suffix) {
  const data = await api('', '/api/device-login', {
    method: 'POST',
    body: {
      device_id: `store-assets-${suffix}-${Date.now()}`,
      platform: 'ios',
      model: 'iPhone store screenshot',
      name,
    },
  });
  await api(data.token, '/api/user/onboarding', { method: 'PUT' });
  return data;
}

async function seedData() {
  const owner = await createDeviceUser('陳美慧', 'owner');
  const family = await createDeviceUser('王志明', 'family');

  await api(owner.token, '/api/medications', {
    method: 'POST',
    body: {
      drug_name: '高血壓藥 Amlodipine',
      dosage: '1 顆',
      usage_notes: '早餐後服用；請依醫師或藥師說明確認。',
      remind_time: ['08:00', '20:00'],
      duration_days: 28,
      total_quantity: 56,
      remaining: 12,
      daily_amount: 2,
      refill_threshold: 7,
    },
  });
  await api(owner.token, '/api/medications', {
    method: 'POST',
    body: {
      drug_name: '血糖藥 Metformin',
      dosage: '半顆',
      usage_notes: '飯後服用；若不舒服請洽醫療專業人員。',
      remind_time: ['12:00'],
      duration_days: 28,
      total_quantity: 28,
      remaining: 18,
      daily_amount: 1,
      refill_threshold: 7,
    },
  });
  const ownerMeds = await api(owner.token, '/api/medications');
  const firstOwnerMed = (ownerMeds.medications || []).find(m => m.drug_name === '高血壓藥 Amlodipine');
  await api(owner.token, `/api/medications/${firstOwnerMed.id}/take`, {
    method: 'POST',
    body: { remind_time: '08:00' },
  });
  await api(owner.token, '/api/health', {
    method: 'POST',
    body: {
      blood_pressure_sys: 122,
      blood_pressure_dia: 78,
      blood_sugar: 104,
      weight: 63.5,
      sleep_hours: 7,
      mood: '穩定',
      notes: '今日狀況良好',
    },
  });

  await api(family.token, '/api/medications', {
    method: 'POST',
    body: {
      drug_name: '長輩慢性處方',
      dosage: '1 顆',
      usage_notes: '晚餐後服用。',
      remind_time: ['19:00'],
      duration_days: 30,
      total_quantity: 30,
      remaining: 6,
      daily_amount: 1,
      refill_threshold: 7,
    },
  });
  await api(family.token, '/api/health', {
    method: 'POST',
    body: {
      blood_pressure_sys: 136,
      blood_pressure_dia: 82,
      blood_sugar: 118,
      weight: 70.2,
      sleep_hours: 6.5,
      mood: '普通',
    },
  });
  const invite = await api(owner.token, '/api/family/invite', {
    method: 'POST',
    body: { relationship: '父母' },
  });
  await api(family.token, '/api/family/invite/accept', {
    method: 'POST',
    body: { code: invite.code },
  });

  return { owner, family, invite };
}

async function polishForScreenshot(page) {
  await page.evaluate(() => {
    document.getElementById('onboard-overlay')?.remove();
    document.querySelectorAll('.toast').forEach(el => el.remove());
    document.body.classList.remove('dark');
    window.scrollTo(0, 0);
  });
}

async function capture(page, file, setup) {
  await setup();
  await page.waitForTimeout(600);
  await polishForScreenshot(page);
  await page.screenshot({ path: path.join(SCREEN_DIR, file), fullPage: false });
}

async function makeFeatureGraphic(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const icon = fs.readFileSync(path.join(ROOT, 'public', 'icon-512.png')).toString('base64');
  await page.setContent(`<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<style>
  *{box-sizing:border-box} body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC","PingFang TC",sans-serif;background:#f5f8f6;color:#17352b}
  .wrap{width:1024px;height:500px;display:grid;grid-template-columns:1.06fr .94fr;overflow:hidden;background:linear-gradient(135deg,#f7fbf7 0%,#e7f3ec 58%,#fff8ec 100%)}
  .left{padding:58px 0 0 62px}
  .brand{display:flex;align-items:center;gap:18px;margin-bottom:34px}
  .brand img{width:92px;height:92px;border-radius:22px;box-shadow:0 20px 45px rgba(39,111,82,.22)}
  .brand .name{font-size:46px;font-weight:900;letter-spacing:0}
  .brand .sub{font-size:22px;color:#557064;margin-top:3px;font-weight:700}
  h1{font-size:56px;line-height:1.08;margin:0 0 18px;font-weight:950;letter-spacing:0;color:#17352b}
  p{font-size:24px;line-height:1.45;margin:0;color:#426357;font-weight:650;max-width:520px}
  .chips{display:flex;gap:12px;margin-top:30px}
  .chip{font-size:21px;font-weight:850;padding:12px 18px;border-radius:999px;background:white;color:#1f5f47;box-shadow:0 12px 28px rgba(39,111,82,.12)}
  .phone{width:286px;height:438px;margin:32px 0 0 86px;border-radius:38px;background:#13251f;padding:12px;box-shadow:0 28px 68px rgba(21,50,39,.30);transform:rotate(2deg)}
  .screen{height:100%;border-radius:29px;background:#f8fbf9;overflow:hidden;padding:20px 18px}
  .top{background:linear-gradient(135deg,#28a166,#4fb477);color:white;border-radius:24px;padding:20px 18px;margin-bottom:14px}
  .top b{font-size:20px}.rate{font-size:44px;font-weight:950;margin-top:18px}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.stat{background:rgba(255,255,255,.2);border-radius:14px;text-align:center;padding:8px 4px;font-size:13px;font-weight:800}
  .card{background:white;border-radius:18px;padding:14px 15px;margin-top:10px;box-shadow:0 8px 20px rgba(47,80,67,.08)}
  .row{display:flex;align-items:center;gap:10px}.pill{background:#e9f6ee;color:#278457;border-radius:12px;padding:7px 10px;font-weight:900;font-size:16px}.title{font-size:20px;font-weight:950}.meta{font-size:15px;color:#6e7f78;margin-top:5px}
</style>
</head>
<body>
<div class="wrap">
  <section class="left">
    <div class="brand"><img src="data:image/png;base64,${icon}"><div><div class="name">藥護家</div><div class="sub">MedCare Home</div></div></div>
    <h1>AI 用藥提醒<br>與家人照護</h1>
    <p>藥袋辨識、服藥打卡、健康紀錄與家人關心，一支手機就能整理每日照護。</p>
    <div class="chips"><div class="chip">用藥提醒</div><div class="chip">AI 藥袋辨識</div><div class="chip">家人照護</div></div>
  </section>
  <section>
    <div class="phone"><div class="screen">
      <div class="top"><b>今日用藥遵從率</b><div class="rate">67%</div><div class="stats"><div class="stat">已吃<br>1</div><div class="stat">未吃<br>2</div><div class="stat">總提醒<br>3</div></div></div>
      <div class="card"><div class="row"><div class="pill">08:00</div><div><div class="title">高血壓藥</div><div class="meta">早餐後服用 · 已打卡</div></div></div></div>
      <div class="card"><div class="row"><div class="pill">19:00</div><div><div class="title">長輩慢性處方</div><div class="meta">家人照護提醒 · 待確認</div></div></div></div>
      <div class="card"><div class="row"><div class="pill">122/78</div><div><div class="title">健康紀錄</div><div class="meta">今日血壓已記錄</div></div></div></div>
    </div></div>
  </section>
</div>
</body>
</html>`);
  await page.screenshot({ path: path.join(GP_DIR, 'feature-graphic-1024x500.png') });
  await page.close();
}

async function makeDocs() {
  const aab = path.join(ROOT, 'build_output', 'yaojidecare-android-release-v1.0-1-20260623.aab');
  const hash = require('crypto').createHash('sha256').update(fs.readFileSync(aab)).digest('hex');
  write(path.join(DOC_DIR, 'google-play-listing.md'), `# Google Play 上架資料

App 名稱：藥護家

簡短說明：
AI 用藥提醒、藥袋辨識、服藥打卡與家人照護工具。

完整說明：
藥護家是一款為日常用藥與家人照護設計的提醒工具，協助你記錄用藥、設定提醒、追蹤服藥狀態，並讓家人能在授權後一起關心用藥情況。

主要功能：
- 用藥提醒：建立藥品名稱、時間、天數與提醒設定。
- 服藥打卡：記錄已服藥、延後或漏服狀態。
- AI 藥袋辨識：拍攝或上傳藥袋照片，輔助擷取藥名與用藥資訊。
- 家人照護：透過邀請碼連結家人，授權後查看用藥狀態與發送提醒。
- 健康紀錄：記錄血壓、血糖、體重與睡眠等日常健康數據。
- 問題回報：可回報錯誤、操作問題或功能建議。

重要提醒：
藥護家提供的是提醒、紀錄與資訊整理功能，不提供醫療診斷、治療建議或處方建議。AI 藥袋辨識結果可能不完整或有誤，請務必以藥袋、處方、藥師或醫師說明為準。如有任何用藥疑問，請諮詢合格醫療專業人員。

分類建議：Medical 或 Health & Fitness
是否含廣告：是，Google AdMob 獎勵廣告
是否免費：建議第一版免費
發布國家：建議先台灣
目標年齡：18+，不針對兒童
隱私權政策：https://yaojidecare.app/privacy.html
`);

  write(path.join(DOC_DIR, 'app-store-listing.md'), `# App Store Connect 上架資料

App 名稱：藥護家
副標題：AI用藥提醒與家人照護
主要分類：Medical
次要分類：Health & Fitness

促銷文字：
用藥提醒、藥袋辨識、服藥打卡與家人照護一次整理，協助你更安心地管理每日用藥。

關鍵字：
吃藥提醒,用藥管理,藥袋辨識,服藥紀錄,家人照護,長輩照護

描述：
藥護家是一款為日常用藥與家人照護設計的提醒工具，協助你記錄用藥、設定提醒、追蹤服藥狀態，並讓家人能在授權後一起關心用藥情況。

主要功能：
- 用藥提醒：建立藥品名稱、時間、天數與提醒設定。
- 服藥打卡：記錄已服藥、延後或漏服狀態。
- AI 藥袋辨識：拍攝或上傳藥袋照片，輔助擷取藥名與用藥資訊。
- 家人照護：透過邀請碼連結家人，授權後查看用藥狀態與發送提醒。
- 健康紀錄：記錄血壓、血糖、體重與睡眠等日常健康數據。
- 通知中心：集中查看用藥提醒、家人提醒與系統通知。
- 資料匯出與帳號刪除：可匯出個人資料，也可刪除裝置帳號。

重要提醒：
藥護家提供的是提醒、紀錄與資訊整理功能，不提供醫療診斷、治療建議或處方建議。AI 藥袋辨識結果可能不完整或有誤，請務必以藥袋、處方、藥師或醫師說明為準。如有任何用藥疑問，請諮詢合格醫療專業人員。
`);

  write(path.join(DOC_DIR, 'review-notes.md'), `# 審查備註

藥護家是用藥提醒與家人照護工具，不提供醫療診斷、治療或處方建議。AI 藥袋辨識僅用於輔助輸入文字，使用者仍需自行確認藥袋、處方、醫師或藥師資訊。

測試方式：
1. 開啟 App 後建立或使用裝置帳號。
2. 新增一筆用藥提醒。
3. 測試服藥打卡與通知中心。
4. 可使用家人邀請碼流程測試家人照護。
5. 可使用相機或相簿測試藥袋辨識入口。
6. 可到設定頁測試問題回報、資料匯出與帳號刪除。

隱私權政策：https://yaojidecare.app/privacy.html
使用者條款：https://yaojidecare.app/terms.html
支援信箱：admin@yaojidecare.app
`);

  write(path.join(OUT, 'asset-manifest.md'), `# 藥護家上架素材包

產生日期：2026-06-23

## Android

- AAB：build_output/yaojidecare-android-release-v1.0-1-20260623.aab
- SHA256：${hash}
- Package：app.yaojidecare
- Version：1.0
- Build：1

## 圖像素材

- App icon 512x512：public/icon-512.png
- Google Play feature graphic：google-play/feature-graphic-1024x500.png
- iPhone 6.7 screenshots：screenshots/iphone-6-7/

## 截圖清單

1. 01-home-today-medications.png
2. 02-add-medication-ai-scan.png
3. 03-medication-list-refill.png
4. 04-family-care.png
5. 05-health-and-support.png

## 文件

- docs/google-play-listing.md
- docs/app-store-listing.md
- docs/review-notes.md
`);
}

async function main() {
  mkdirp(SCREEN_DIR);
  mkdirp(GP_DIR);
  mkdirp(DOC_DIR);

  const dbFile = path.join(OUT, 'store-demo.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      CREATE_DEMO_DATA: 'false',
      DB_FILE: dbFile,
      JWT_SECRET: 'store-assets-local-jwt-secret-20260623-at-least-32',
      SALT_ROUNDS: '4',
      EMAIL_MODE: 'log',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverLog = '';
  server.stdout.on('data', d => { serverLog += d.toString(); });
  server.stderr.on('data', d => { serverLog += d.toString(); });

  try {
    await waitForServer();
    const seeded = await seedData();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 430, height: 932 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: 'zh-TW',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });
    await context.addInitScript(({ token }) => {
      localStorage.setItem('medremind_auth_token', token);
      localStorage.setItem('medremind_device_identifier', 'store-assets-owner-device');
      localStorage.setItem('medremind_install_dismissed', '1');
    }, { token: seeded.owner.token });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#main-app', { state: 'visible', timeout: 15000 });

    await capture(page, '01-home-today-medications.png', async () => {
      await page.evaluate(() => switchPage('home'));
    });

    await capture(page, '02-add-medication-ai-scan.png', async () => {
      await page.evaluate(() => {
        switchPage('medications');
        showAddMedication();
        document.getElementById('add-drug-name').value = '降血壓藥';
        document.getElementById('add-dosage').value = '1 顆';
        document.getElementById('add-notes').value = '早餐後服用';
        const result = document.getElementById('scan-result');
        result.style.display = 'block';
        result.innerHTML = '<div style="padding:12px;background:#e8f5e9;border-radius:8px;font-size:15px;"><div style="background:#fff;padding:10px 12px;border-radius:8px;margin-bottom:10px;border-left:4px solid var(--green);"><div style="font-size:13px;color:var(--green);font-weight:600;margin-bottom:4px;">AI 藥袋辨識結果</div><div style="font-size:18px;font-weight:700;">高血壓藥 Amlodipine</div><div style="margin-top:6px;font-size:14px;">劑量：1 顆 · 早餐後服用</div><div style="font-size:14px;">建議提醒：08:00、20:00</div><div style="margin-top:4px;font-size:13px;color:var(--text-light);">請以藥袋、醫師或藥師說明為準。</div></div></div>';
      });
    });

    await capture(page, '03-medication-list-refill.png', async () => {
      await page.evaluate(() => {
        document.querySelectorAll('#modal-container .modal-overlay').forEach(el => el.remove());
        switchPage('medications');
      });
    });

    await capture(page, '04-family-care.png', async () => {
      await page.evaluate(() => {
        document.querySelectorAll('#modal-container .modal-overlay').forEach(el => el.remove());
        switchPage('family');
      });
    });

    await capture(page, '05-health-and-support.png', async () => {
      await page.evaluate(() => {
        document.querySelectorAll('#modal-container .modal-overlay').forEach(el => el.remove());
        switchPage('health');
      });
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.margin = '0 0 12px';
        card.innerHTML = '<h3 style="margin-bottom:8px;">今日健康與問題回報</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;"><div class="health-item"><div class="value">122/78</div><div class="label">血壓</div><div class="unit">mmHg</div></div><div class="health-item"><div class="value">104</div><div class="label">血糖</div><div class="unit">mg/dL</div></div></div><div style="font-size:14px;color:var(--text-light);line-height:1.5;">遇到提醒、打卡或家人照護問題時，可附最近操作紀錄回報，方便客服排查。</div><button class="btn btn-outline" style="width:100%;margin-top:10px;">回報問題</button>';
        const healthPage = document.getElementById('health-page');
        healthPage.insertBefore(card, healthPage.children[1] || null);
        document.getElementById('record-bp-sys').value = '122';
        document.getElementById('record-bp-dia').value = '78';
        document.getElementById('record-sugar').value = '104';
        document.getElementById('record-weight').value = '63.5';
      });
    });

    await makeFeatureGraphic(browser);
    await browser.close();
    await makeDocs();

    console.log(`Store assets prepared at ${OUT}`);
  } catch (err) {
    console.error(serverLog);
    throw err;
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
