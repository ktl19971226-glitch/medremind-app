import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRules } from '../modules/catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const dbPath = path.join(dataDir, 'db.json');

const initialState = {
  devices: [],
  users: [],
  locations: [
    {
      id: 'home',
      ownerDeviceId: 'demo',
      label: '住家',
      city: '台北市',
      district: '信義區',
      lat: 25.033,
      lng: 121.5654
    }
  ],
  rules: defaultRules.map(rule => ({ ...rule, ownerDeviceId: 'demo' })),
  alerts: []
};

function cloneDefaultRules(deviceId) {
  return defaultRules.map(rule => ({ ...rule, ownerDeviceId: deviceId }));
}

function migrateState(state) {
  const next = { ...initialState, ...(state || {}) };
  next.devices = Array.isArray(next.devices) ? next.devices : [];
  next.users = Array.isArray(next.users) ? next.users : [];
  next.locations = Array.isArray(next.locations) ? next.locations : [];
  next.rules = Array.isArray(next.rules) ? next.rules : [];
  next.alerts = Array.isArray(next.alerts) ? next.alerts : [];

  next.locations = next.locations.map(location => ({ ownerDeviceId: 'demo', ...location }));
  next.rules = next.rules.map(rule => ({ ownerDeviceId: 'demo', ...rule }));
  next.alerts = next.alerts.map(alert => ({
    ownerDeviceId: alert.ownerDeviceId || alert.deviceId || 'demo',
    read: Boolean(alert.read),
    archived: Boolean(alert.archived),
    ...alert
  }));
  return next;
}

export function readState() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) writeState(initialState);
  return migrateState(JSON.parse(fs.readFileSync(dbPath, 'utf-8')));
}

export function writeState(state) {
  fs.writeFileSync(dbPath, JSON.stringify(state, null, 2));
}

export function updateState(mutator) {
  const state = readState();
  const next = mutator(state) || state;
  writeState(next);
  return next;
}

export function ensureDeviceState(state, deviceId, profile = {}) {
  const now = new Date().toISOString();
  const id = deviceId || 'demo';

  if (!state.users.some(user => user.deviceId === id)) {
    state.users.push({
      deviceId: id,
      label: profile.label || '我的手機',
      city: profile.city || '台北市',
      district: profile.district || '信義區',
      onboardingCompleted: Boolean(profile.onboardingCompleted),
      createdAt: now,
      updatedAt: now
    });
  } else {
    state.users = state.users.map(user =>
      user.deviceId === id
        ? { ...user, ...profile, updatedAt: now, onboardingCompleted: profile.onboardingCompleted ?? user.onboardingCompleted }
        : user
    );
  }

  if (!state.locations.some(location => location.ownerDeviceId === id)) {
    const user = state.users.find(item => item.deviceId === id);
    state.locations.push({
      id: `loc-${Date.now()}`,
      ownerDeviceId: id,
      label: profile.locationLabel || '主要地點',
      city: profile.city || user?.city || '台北市',
      district: profile.district || user?.district || '信義區',
      lat: profile.lat,
      lng: profile.lng,
      createdAt: now,
      updatedAt: now
    });
  }

  const existingRuleIds = new Set(state.rules.filter(rule => rule.ownerDeviceId === id).map(rule => rule.id));
  const missingRules = cloneDefaultRules(id).filter(rule => !existingRuleIds.has(rule.id));
  state.rules.push(...missingRules);

  return state;
}

export function selectDeviceState(state, deviceId) {
  const id = deviceId || 'demo';
  const user = state.users.find(item => item.deviceId === id) || null;
  return {
    user,
    devices: state.devices.filter(device => device.deviceId === id),
    locations: state.locations.filter(location => location.ownerDeviceId === id),
    rules: state.rules.filter(rule => rule.ownerDeviceId === id),
    alerts: state.alerts
      .filter(alert => alert.ownerDeviceId === id && !alert.archived)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    unreadCount: state.alerts.filter(alert => alert.ownerDeviceId === id && !alert.read && !alert.archived).length
  };
}
