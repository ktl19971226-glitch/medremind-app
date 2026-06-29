import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRules } from '../modules/catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const dbPath = path.join(dataDir, 'db.json');

const initialState = {
  devices: [],
  locations: [
    {
      id: 'home',
      label: '住家',
      city: '台北市',
      district: '信義區',
      lat: 25.033,
      lng: 121.5654
    }
  ],
  rules: defaultRules,
  alerts: []
};

export function readState() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) writeState(initialState);
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
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
