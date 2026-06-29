import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categories } from './modules/catalog.js';
import { ensureDeviceState, readState, selectDeviceState, updateState } from './services/store.js';
import { buildAlerts } from './services/alerts.js';
import { sendPush } from './services/push.js';

const app = express();
const port = Number(process.env.PORT || 8061);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = process.env.WEB_DIR || path.resolve(__dirname, '../../mobile/dist');

app.use(cors());
app.use(express.json());

function getDeviceId(req) {
  return req.get('x-device-id') || req.query.deviceId || req.body?.deviceId || 'demo';
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'local-alert-api', time: new Date().toISOString() });
});

app.get('/api/catalog', (req, res) => {
  res.json({ categories });
});

app.get('/api/state', (req, res) => {
  const deviceId = getDeviceId(req);
  const state = updateState(current => ensureDeviceState(current, deviceId));
  res.json(selectDeviceState(state, deviceId));
});

app.post('/api/bootstrap', (req, res) => {
  const deviceId = getDeviceId(req);
  const state = updateState(current => ensureDeviceState(current, deviceId, {
    label: req.body.label || '我的手機',
    city: req.body.city,
    district: req.body.district,
    lat: req.body.lat,
    lng: req.body.lng,
    onboardingCompleted: true
  }));
  res.json({ success: true, state: selectDeviceState(state, deviceId) });
});

app.post('/api/devices/register', (req, res) => {
  const deviceId = getDeviceId(req);
  const { pushToken, platform } = req.body;
  if (!pushToken) return res.status(400).json({ error: 'pushToken is required' });

  const state = updateState(current => {
    ensureDeviceState(current, deviceId);
    const devices = current.devices.filter(device => device.pushToken !== pushToken && device.deviceId !== deviceId);
    devices.push({ deviceId, pushToken, platform, updatedAt: new Date().toISOString() });
    current.devices = devices;
    return current;
  });
  res.json({ success: true, devices: selectDeviceState(state, deviceId).devices.length });
});

app.post('/api/locations', (req, res) => {
  const deviceId = getDeviceId(req);
  const location = {
    id: `loc-${Date.now()}`,
    ownerDeviceId: deviceId,
    label: req.body.label || `${req.body.city || ''}${req.body.district || ''}` || '新地點',
    city: req.body.city || '台北市',
    district: req.body.district || '',
    lat: req.body.lat,
    lng: req.body.lng,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const state = updateState(current => {
    ensureDeviceState(current, deviceId);
    current.locations.push(location);
    return current;
  });
  res.json({ success: true, location, locations: selectDeviceState(state, deviceId).locations });
});

app.patch('/api/locations/:id', (req, res) => {
  const deviceId = getDeviceId(req);
  const state = updateState(current => {
    ensureDeviceState(current, deviceId);
    current.locations = current.locations.map(location =>
      location.ownerDeviceId === deviceId && location.id === req.params.id
        ? { ...location, ...req.body, ownerDeviceId: deviceId, updatedAt: new Date().toISOString() }
        : location
    );
    return current;
  });
  res.json({ success: true, locations: selectDeviceState(state, deviceId).locations });
});

app.delete('/api/locations/:id', (req, res) => {
  const deviceId = getDeviceId(req);
  const state = updateState(current => {
    current.locations = current.locations.filter(location => !(location.ownerDeviceId === deviceId && location.id === req.params.id));
    return current;
  });
  res.json({ success: true, locations: selectDeviceState(state, deviceId).locations });
});

app.patch('/api/rules/:id', (req, res) => {
  const deviceId = getDeviceId(req);
  const state = updateState(current => {
    ensureDeviceState(current, deviceId);
    current.rules = current.rules.map(rule =>
      rule.ownerDeviceId === deviceId && rule.id === req.params.id ? { ...rule, ...req.body, ownerDeviceId: deviceId } : rule
    );
    return current;
  });
  res.json({ success: true, rules: selectDeviceState(state, deviceId).rules });
});

app.post('/api/check-now', async (req, res) => {
  const deviceId = getDeviceId(req);
  const current = updateState(state => ensureDeviceState(state, deviceId));
  const alerts = await buildAlerts(current, 'manual', deviceId);
  const state = updateState(next => {
    next.alerts = [...alerts, ...next.alerts].slice(0, 300);
    return next;
  });

  const newest = alerts.find(alert => !alert.silenced);
  const devices = state.devices.filter(device => device.deviceId === deviceId);
  const push = newest ? await sendPush(devices, newest) : { sent: 0, tickets: [] };
  res.json({ success: true, generated: alerts.length, pushed: push.sent, newest, state: selectDeviceState(state, deviceId) });
});

app.post('/api/test-push', async (req, res) => {
  const deviceId = getDeviceId(req);
  const state = readState();
  const alert = {
    id: `test-${Date.now()}`,
    ownerDeviceId: deviceId,
    categoryId: 'system',
    moduleId: 'test',
    title: '在地提醒測試',
    body: '手機推播連線正常。',
    severity: 'normal'
  };
  const push = await sendPush(state.devices.filter(device => device.deviceId === deviceId), alert);
  res.json({ success: true, pushed: push.sent, tickets: push.tickets });
});

app.patch('/api/alerts/:id', (req, res) => {
  const deviceId = getDeviceId(req);
  const state = updateState(current => {
    current.alerts = current.alerts.map(alert =>
      alert.ownerDeviceId === deviceId && alert.id === req.params.id
        ? { ...alert, read: req.body.read ?? alert.read, archived: req.body.archived ?? alert.archived }
        : alert
    );
    return current;
  });
  res.json({ success: true, alerts: selectDeviceState(state, deviceId).alerts });
});

app.post('/api/alerts/read-all', (req, res) => {
  const deviceId = getDeviceId(req);
  const state = updateState(current => {
    current.alerts = current.alerts.map(alert => alert.ownerDeviceId === deviceId ? { ...alert, read: true } : alert);
    return current;
  });
  res.json({ success: true, alerts: selectDeviceState(state, deviceId).alerts });
});

app.get('/api/admin/summary', (req, res) => {
  const state = readState();
  res.json({
    devices: state.devices.length,
    users: state.users.length,
    locations: state.locations.length,
    alerts: state.alerts.length,
    unreadAlerts: state.alerts.filter(alert => !alert.read && !alert.archived).length,
    latestAlertAt: state.alerts[0]?.createdAt || null,
    enabledRules: state.rules.filter(rule => rule.enabled).length
  });
});

cron.schedule('*/15 * * * *', async () => {
  const current = readState();
  const deviceIds = [...new Set(current.users.map(user => user.deviceId))];
  for (const deviceId of deviceIds) {
    try {
      const alerts = await buildAlerts(current, 'scheduled', deviceId);
      const sendable = alerts.find(alert => !alert.silenced);
      const next = updateState(state => {
        state.alerts = [...alerts, ...state.alerts].slice(0, 300);
        return state;
      });
      if (sendable) await sendPush(next.devices.filter(device => device.deviceId === deviceId), sendable);
    } catch (error) {
      console.error('[scheduled-alert]', error);
    }
  }
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
