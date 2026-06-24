const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'store_assets', '20260623');
const SCREEN_DIR = path.join(OUT, 'screenshots', 'ipad-12-9');
const PORT = 8068;
const BASE = `http://127.0.0.1:${PORT}`;

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
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
      device_id: `store-assets-ipad-${suffix}-${Date.now()}`,
      platform: 'ios',
      model: 'iPad Pro store screenshot',
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

  return { owner };
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
  await page.waitForTimeout(700);
  await polishForScreenshot(page);
  await page.screenshot({ path: path.join(SCREEN_DIR, file), fullPage: false });
}

async function main() {
  mkdirp(SCREEN_DIR);

  const dbFile = path.join(OUT, 'store-demo-ipad.db');
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
      JWT_SECRET: 'store-assets-local-jwt-secret-20260624-at-least-32',
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
      viewport: { width: 1024, height: 1366 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'zh-TW',
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });
    await context.addInitScript(({ token }) => {
      localStorage.setItem('medremind_auth_token', token);
      localStorage.setItem('medremind_device_identifier', 'store-assets-ipad-owner-device');
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

    await browser.close();
    console.log(`iPad screenshots prepared at ${SCREEN_DIR}`);
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
