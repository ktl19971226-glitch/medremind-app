import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categories } from './modules/catalog.js';
import { readState, updateState } from './services/store.js';
import { buildAlerts } from './services/alerts.js';
import { sendPush } from './services/push.js';

const app = express();
const port = Number(process.env.PORT || 8061);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = process.env.WEB_DIR || path.resolve(__dirname, '../../mobile/dist');

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'local-alert-api', time: new Date().toISOString() });
});

app.get('/api/catalog', (req, res) => {
  res.json({ categories });
});

app.get('/api/state', (req, res) => {
  res.json(readState());
});

app.post('/api/devices/register', (req, res) => {
  const { pushToken, platform } = req.body;
  if (!pushToken) return res.status(400).json({ error: 'pushToken is required' });

  const state = updateState(current => {
    const devices = current.devices.filter(device => device.pushToken !== pushToken);
    devices.push({ pushToken, platform, updatedAt: new Date().toISOString() });
    current.devices = devices;
    return current;
  });
  res.json({ success: true, devices: state.devices.length });
});

app.post('/api/locations', (req, res) => {
  const location = { id: `loc-${Date.now()}`, ...req.body };
  const state = updateState(current => {
    current.locations.push(location);
    return current;
  });
  res.json({ success: true, location, locations: state.locations });
});

app.patch('/api/rules/:id', (req, res) => {
  const state = updateState(current => {
    current.rules = current.rules.map(rule =>
      rule.id === req.params.id ? { ...rule, ...req.body } : rule
    );
    return current;
  });
  res.json({ success: true, rules: state.rules });
});

app.post('/api/check-now', async (req, res) => {
  const state = updateState(current => {
    const alerts = buildAlerts(current, 'manual');
    current.alerts = [...alerts, ...current.alerts].slice(0, 100);
    return current;
  });

  const newest = state.alerts[0];
  const push = newest ? await sendPush(state.devices, newest) : { sent: 0, tickets: [] };
  res.json({ success: true, generated: state.alerts.length, pushed: push.sent, newest });
});

app.post('/api/test-push', async (req, res) => {
  const state = readState();
  const alert = {
    id: `test-${Date.now()}`,
    categoryId: 'system',
    moduleId: 'test',
    title: '在地提醒測試',
    body: '手機推播連線正常。',
    severity: 'normal'
  };
  const push = await sendPush(state.devices, alert);
  res.json({ success: true, pushed: push.sent, tickets: push.tickets });
});

cron.schedule('*/15 * * * *', () => {
  updateState(current => {
    const alerts = buildAlerts(current, 'scheduled');
    current.alerts = [...alerts, ...current.alerts].slice(0, 100);
    sendPush(current.devices, alerts[0]).catch(error => console.error('[push]', error));
    return current;
  });
});

if (fs.existsSync(webDir)) {
  app.use(express.static(webDir));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(webDir, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Local Alert API running on http://0.0.0.0:${port}`);
});
