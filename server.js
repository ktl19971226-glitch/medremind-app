require('dotenv').config();
// 藥護家 App - 後端伺服器
// Node.js + Express + SQLite (sql.js 內存版)

const express = require('express');
const initSqlJs = require('sql.js');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const http2 = require('http2');
const { spawn } = require('child_process');
let firebaseAdmin = null;
try {
    firebaseAdmin = require('firebase-admin');
} catch (e) {
    firebaseAdmin = null;
}

const PORT = Number(process.env.PORT || 8050);
const HOST = process.env.HOST || '127.0.0.1';
const JWT_SECRET = process.env.JWT_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const SALT_ROUNDS = Number(process.env.SALT_ROUNDS || 12);
const LEGACY_PASSWORD_SALT = process.env.LEGACY_PASSWORD_SALT || '';
const DB_FILE = path.resolve(__dirname, process.env.DB_FILE || 'medremind.db');
const CREATE_DEMO_DATA = process.env.CREATE_DEMO_DATA === 'true' || process.env.NODE_ENV !== 'production';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_NAME = process.env.ADMIN_NAME || '系統管理員';
const ADMIN_APP_BOOTSTRAP_TOKEN = process.env.ADMIN_APP_BOOTSTRAP_TOKEN || '';
const ADMIN_APP_BOOTSTRAP_TOKEN_HASH = process.env.ADMIN_APP_BOOTSTRAP_TOKEN_HASH || '';
const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://yaojidecare.app').replace(/\/+$/, '');
const EMAIL_FROM = process.env.EMAIL_FROM || 'Yaojide <admin@yaojidecare.app>';
const EMAIL_MODE = process.env.EMAIL_MODE || (process.env.NODE_ENV === 'production' ? 'sendmail' : 'log');
const SENDMAIL_PATH = process.env.SENDMAIL_PATH || '/usr/sbin/sendmail';
const EMAIL_VERIFY_TTL_MINUTES = Number(process.env.EMAIL_VERIFY_TTL_MINUTES || 60 * 24);
const PASSWORD_RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);
const API_RATE_LIMIT_PER_MIN = Number(process.env.API_RATE_LIMIT_PER_MIN || 240);
const SUBSCRIPTION_ENTITLEMENT_ID = process.env.SUBSCRIPTION_ENTITLEMENT_ID || 'pro';
const PRO_MONTHLY_PRODUCT_ID = process.env.PRO_MONTHLY_PRODUCT_ID || 'yaojidecare_pro_monthly';
const PRO_YEARLY_PRODUCT_ID = process.env.PRO_YEARLY_PRODUCT_ID || 'yaojidecare_pro_yearly';
const REVENUECAT_IOS_API_KEY = process.env.REVENUECAT_IOS_API_KEY || '';
const REVENUECAT_ANDROID_API_KEY = process.env.REVENUECAT_ANDROID_API_KEY || '';
const ADMIN_APP_SESSION_HOURS = Number(process.env.ADMIN_APP_SESSION_HOURS || 12);
const ENABLE_DB_RESTORE = process.env.ENABLE_DB_RESTORE === 'true';
const DB_AUTO_BACKUP_DIR = process.env.DB_AUTO_BACKUP_DIR || path.join(__dirname, 'backups', 'auto');
const DB_AUTO_BACKUP_KEEP_DAYS = Number(process.env.DB_AUTO_BACKUP_KEEP_DAYS || 14);
const AI_SCAN_DAILY_FREE_LIMIT = Number(process.env.AI_SCAN_DAILY_FREE_LIMIT || 1);
const AI_SCAN_DAILY_REWARD_LIMIT = Number(process.env.AI_SCAN_DAILY_REWARD_LIMIT || 3);
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
const FIREBASE_SERVICE_ACCOUNT_BASE64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || '';
const APNS_KEY_ID = process.env.APNS_KEY_ID || '';
const APNS_TEAM_ID = process.env.APNS_TEAM_ID || '';
const APNS_AUTH_KEY_BASE64 = process.env.APNS_AUTH_KEY_BASE64 || '';
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'app.yaojidecare';
const APNS_ENV = process.env.APNS_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8050,http://localhost:3000,https://yaojidecare.app,https://www.yaojidecare.app,capacitor://localhost,ionic://localhost')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long');
}

// bcrypt is used for all new passwords. Legacy SHA-256 hashes are accepted once
// so existing test accounts can be transparently upgraded after login.
function legacyHashPwd(p) { return crypto.createHash('sha256').update(String(p) + LEGACY_PASSWORD_SALT).digest('hex'); }
function hashPwd(p) { return bcrypt.hashSync(String(p), SALT_ROUNDS); }
function verifyPwd(password, storedHash) {
    if (!storedHash) return false;
    if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
        return bcrypt.compareSync(String(password), storedHash);
    }
    return !!LEGACY_PASSWORD_SALT && storedHash === legacyHashPwd(password);
}
function isLegacyHash(storedHash) {
    return storedHash && !storedHash.startsWith('$2a$') && !storedHash.startsWith('$2b$') && !storedHash.startsWith('$2y$');
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function escapeHTML(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function compactReportValue(value, maxLength = 160) {
    return String(value || '')
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
        .replace(/token=[^&\s]+/gi, 'token=[redacted]')
        .slice(0, maxLength);
}

function createRawToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function safeTokenEqual(provided, expected) {
    const a = Buffer.from(String(provided || ''));
    const b = Buffer.from(String(expected || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyAdminAppBootstrapToken(token) {
    const provided = String(token || '').trim();
    if (!provided) return false;
    if (ADMIN_APP_BOOTSTRAP_TOKEN && safeTokenEqual(provided, ADMIN_APP_BOOTSTRAP_TOKEN)) return true;
    if (ADMIN_APP_BOOTSTRAP_TOKEN_HASH) return safeTokenEqual(hashToken(provided), ADMIN_APP_BOOTSTRAP_TOKEN_HASH);
    return false;
}

function hashDeviceIdentifier(identifier) {
    return crypto.createHash('sha256').update(String(identifier)).digest('hex');
}

function makeAccountCode(id) {
    return `YJ-${String(id).padStart(6, '0')}`;
}

function publicEmail(user) {
    const email = user && user.email ? String(user.email) : '';
    return email.endsWith('@device.yaojidecare.local') ? null : email;
}

function parseFirebaseServiceAccount() {
    const raw = FIREBASE_SERVICE_ACCOUNT_BASE64
        ? Buffer.from(FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
        : FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    const credentials = JSON.parse(raw);
    if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    if (FIREBASE_PROJECT_ID && !credentials.project_id) credentials.project_id = FIREBASE_PROJECT_ID;
    return credentials;
}

function getFirebaseMessaging() {
    if (!firebaseAdmin) return null;
    try {
        if (!firebaseAdmin.apps.length) {
            const credentials = parseFirebaseServiceAccount();
            if (!credentials) return null;
            firebaseAdmin.initializeApp({
                credential: firebaseAdmin.credential.cert(credentials),
                projectId: credentials.project_id || FIREBASE_PROJECT_ID || undefined
            });
        }
        return firebaseAdmin.messaging();
    } catch (e) {
        console.error('Firebase messaging unavailable:', e.message);
        return null;
    }
}

function getApnsAuthKey() {
    if (!APNS_AUTH_KEY_BASE64) return '';
    return Buffer.from(APNS_AUTH_KEY_BASE64, 'base64').toString('utf8').replace(/\\n/g, '\n');
}

function getApnsAuthToken() {
    const key = getApnsAuthKey();
    if (!key || !APNS_KEY_ID || !APNS_TEAM_ID) return '';
    return jwt.sign(
        { iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) },
        key,
        { algorithm: 'ES256', header: { alg: 'ES256', kid: APNS_KEY_ID } }
    );
}

function sendApnsNotification(token, payload = {}) {
    return new Promise((resolve, reject) => {
        const authToken = getApnsAuthToken();
        if (!authToken) return resolve({ skipped: 'apns_not_configured' });
        const host = APNS_ENV === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
        const client = http2.connect(host);
        let settled = false;
        const finish = (err, result) => {
            if (settled) return;
            settled = true;
            client.close();
            if (err) reject(err);
            else resolve(result || {});
        };
        client.on('error', finish);
        const body = JSON.stringify({
            aps: {
                alert: {
                    title: String(payload.title || '藥護家通知').slice(0, 120),
                    body: String(payload.body || payload.message || '').slice(0, 240)
                },
                sound: 'default',
                badge: 1
            },
            ...(payload.data || {})
        });
        const req = client.request({
            ':method': 'POST',
            ':path': `/3/device/${token}`,
            authorization: `bearer ${authToken}`,
            'apns-topic': APNS_BUNDLE_ID,
            'apns-push-type': 'alert',
            'content-type': 'application/json'
        });
        let response = '';
        let status = 0;
        req.on('response', headers => { status = Number(headers[':status'] || 0); });
        req.setEncoding('utf8');
        req.on('data', chunk => { response += chunk; });
        req.on('end', () => {
            if (status >= 200 && status < 300) return finish(null, { sent: 1 });
            const err = new Error(`APNs ${status}: ${response}`);
            err.status = status;
            err.response = response;
            finish(err);
        });
        req.on('error', finish);
        req.end(body);
    });
}

function normalizePushPlatform(value) {
    const platform = String(value || '').trim().toLowerCase();
    if (['ios', 'android', 'web'].includes(platform)) return platform;
    return 'unknown';
}

function getPushConfigStatus() {
    return {
        firebase: {
            configured: !!(FIREBASE_SERVICE_ACCOUNT_JSON || FIREBASE_SERVICE_ACCOUNT_BASE64),
            project_id: FIREBASE_PROJECT_ID || null
        },
        apns: {
            configured: !!(APNS_KEY_ID && APNS_TEAM_ID && APNS_AUTH_KEY_BASE64 && APNS_BUNDLE_ID),
            key_id: APNS_KEY_ID ? `${APNS_KEY_ID.slice(0, 4)}...` : null,
            team_id: APNS_TEAM_ID || null,
            bundle_id: APNS_BUNDLE_ID,
            env: APNS_ENV
        }
    };
}

async function sendPushToUser(userId, payload = {}) {
    const messaging = getFirebaseMessaging();
    const tokenRows = dbAll(
        "SELECT token, platform FROM push_tokens WHERE user_id=? AND enabled=1 ORDER BY last_seen_at DESC LIMIT 20",
        [userId]
    ).filter(row => row.token);
    if (tokenRows.length === 0) return { sent: 0, skipped: 'no_tokens' };

    let sent = 0;
    let skipped = 0;
    for (const row of tokenRows) {
        const token = row.token;
        try {
            if (row.platform === 'ios') {
                const result = await sendApnsNotification(token, payload);
                if (result.skipped) skipped += 1;
                else sent += 1;
            } else {
                if (!messaging) {
                    skipped += 1;
                    continue;
                }
                await messaging.send({
                    token,
                    notification: {
                        title: String(payload.title || '藥護家通知').slice(0, 120),
                        body: String(payload.body || payload.message || '').slice(0, 240)
                    },
                    data: Object.fromEntries(Object.entries(payload.data || {}).map(([key, value]) => [key, String(value ?? '')])),
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                            channelId: 'medication_reminders'
                        }
                    }
                });
                sent += 1;
            }
        } catch (e) {
            const code = e.code || '';
            console.error('Push send failed:', code || e.message);
            if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code) || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(e.response || '')) {
                dbRun('UPDATE push_tokens SET enabled=0, updated_at=CURRENT_TIMESTAMP WHERE token=?', [token]);
            }
        }
    }
    if (sent > 0) saveDB();
    return { sent, skipped };
}

function createUserNotification(userId, payload = {}, type = 'admin_message') {
    const title = String(payload.title || '藥護家通知').trim().slice(0, 120);
    const message = String(payload.body || payload.message || '').trim().slice(0, 500);
    const actionUrl = String(payload.data?.action_url || '#notifications').trim().slice(0, 160);
    dbRun(
        'INSERT INTO notifications (user_id, type, title, message, is_read, status, action_url) VALUES (?,?,?,?,0,?,?)',
        [userId, type, title, message, 'unread', actionUrl]
    );
}

function describePushResult(result = {}) {
    if (result.sent > 0) return `原生推播已送出 ${result.sent} 台裝置`;
    if (result.skipped === 'no_tokens') return '此用戶尚未從原生 App 註冊推播 token';
    if (Number(result.skipped || 0) > 0) return '推播 token 存在，但 FCM/APNs 尚未設定或發送被略過';
    return '原生推播尚未送出';
}

const FAMILY_RELATIONSHIPS = new Set(['子女', '父母', '配偶', '家人', '照護者']);

function normalizeFamilyRelationship(value) {
    const relationship = String(value || '家人').trim().substring(0, 20);
    return FAMILY_RELATIONSHIPS.has(relationship) ? relationship : '家人';
}

function inverseFamilyRelationship(relationship) {
    const normalized = normalizeFamilyRelationship(relationship);
    if (normalized === '子女') return '父母';
    if (normalized === '父母') return '子女';
    if (normalized === '配偶') return '配偶';
    return '家人';
}

function normalizeReminderTimes(value) {
    if (!Array.isArray(value)) return null;
    const times = [...new Set(value.map(v => String(v || '').trim()))]
        .filter(v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v))
        .sort();
    return times.length ? times : null;
}

function parseOptionalInt(value, { min = null, max = null } = {}) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return NaN;
    if (min !== null && parsed < min) return NaN;
    if (max !== null && parsed > max) return NaN;
    return parsed;
}

function parseOptionalNumber(value, { min = null, max = null } = {}) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return NaN;
    if (min !== null && parsed < min) return NaN;
    if (max !== null && parsed > max) return NaN;
    return parsed;
}

function isValidDateString(value) {
    const raw = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
    const date = new Date(`${raw}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw;
}

function normalizeMedicationImage(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (raw.length > 750000) return false;
    if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(raw)) return false;
    return raw.replace(/\s/g, '');
}

function expiresAt(minutes) {
    return new Date(Date.now() + minutes * 60000).toISOString();
}

function encodeHeader(value) {
    return `=?UTF-8?B?${Buffer.from(String(value), 'utf8').toString('base64')}?=`;
}

function sendEmail({ to, subject, html }) {
    const safeTo = normalizeEmail(to);
    const fromMatch = String(EMAIL_FROM).match(/<([^>]+)>/) || String(EMAIL_FROM).match(/([^\s<>]+@[^\s<>]+)/);
    const envelopeFrom = fromMatch ? fromMatch[1] : 'admin@yaojidecare.app';
    const body = String(html || '').trim();
    const message = [
        `From: ${EMAIL_FROM}`,
        `To: ${safeTo}`,
        `Subject: ${encodeHeader(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        body
    ].join('\n');

    if (EMAIL_MODE === 'log') {
        console.log(`📧 Email log mode -> ${safeTo}: ${subject}\n${body}`);
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const child = spawn(SENDMAIL_PATH, ['-odq', '-f', envelopeFrom, '-t', '-i']);
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error('sendmail timed out'));
        }, 8000);
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.on('error', error => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', code => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error(stderr || `sendmail exited with code ${code}`));
        });
        child.stdin.end(message);
    });
}

function authMailTemplate(title, intro, actionText, actionUrl, expiresText) {
    const safeUrl = escapeHTML(actionUrl);
    return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
            <h2 style="margin:0 0 12px;color:#0f766e;">${escapeHTML(title)}</h2>
            <p style="line-height:1.7;">${escapeHTML(intro)}</p>
            <p style="margin:28px 0;">
                <a href="${safeUrl}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;">${escapeHTML(actionText)}</a>
            </p>
            <p style="font-size:14px;line-height:1.7;color:#6b7280;">如果按鈕無法開啟，請複製以下連結到瀏覽器：<br><a href="${safeUrl}">${safeUrl}</a></p>
            <p style="font-size:13px;color:#9ca3af;">${escapeHTML(expiresText)}</p>
        </div>`;
}

// 簡易速率限制。正式站在 Nginx 後面，只信任 loopback proxy 轉出的真實來源 IP。
const rateLimitMap = new Map();
function rateLimitKey(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = req.ip || forwarded || req.socket?.remoteAddress || 'unknown';
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const tokenKey = auth ? hashToken(auth).slice(0, 16) : 'anon';
    return `${ip}:${tokenKey}`;
}
function rateLimiter(maxPerMin = API_RATE_LIMIT_PER_MIN) {
    return (req, res, next) => {
        const key = rateLimitKey(req);
        const now = Date.now();
        if (!rateLimitMap.has(key)) rateLimitMap.set(key, []);
        const window = rateLimitMap.get(key).filter(t => now - t < 60000);
        window.push(now);
        rateLimitMap.set(key, window);
        if (window.length > maxPerMin) return res.status(429).json({ error: '請求過於頻繁，請稍後再試' });
        next();
    };
}
// 每分鐘清理一次過期的 IP 記錄
setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of rateLimitMap) {
        const fresh = times.filter(t => now - t < 60000);
        if (fresh.length === 0) rateLimitMap.delete(ip);
        else rateLimitMap.set(ip, fresh);
    }
}, 60000);

const app = express();
let db = null;
app.set('trust proxy', 'loopback');

// 輔助函數
function dbAll(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
}
function dbGet(sql, params = []) { const rows = dbAll(sql, params); return rows[0] || null; }
function dbRun(sql, params = []) { db.run(sql, params); return dbAll('SELECT last_insert_rowid() AS id')[0]; }
function saveDB() { fs.writeFileSync(DB_FILE, Buffer.from(db.export())); }

function taipeiDateKey(date = new Date()) {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function sanitizeAuditValue(value, maxLength = 4000) {
    if (value === undefined) return null;
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    return String(raw || '').slice(0, maxLength);
}

function logAdminAction(req, action, { targetType = null, targetId = null, summary = '', before = null, after = null } = {}) {
    try {
        dbRun(
            `INSERT INTO admin_audit_logs
             (admin_user_id, action, target_type, target_id, summary, before_value, after_value, ip_address, user_agent)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [
                req?.user?.id || null,
                String(action || 'admin_action').slice(0, 80),
                targetType ? String(targetType).slice(0, 80) : null,
                targetId || null,
                String(summary || '').slice(0, 500),
                sanitizeAuditValue(before),
                sanitizeAuditValue(after),
                String(req?.ip || req?.headers?.['x-forwarded-for'] || '').slice(0, 80),
                String(req?.headers?.['user-agent'] || '').slice(0, 300)
            ]
        );
    } catch (e) {
        console.error('Admin audit log failed:', e.message);
    }
}

function createAutomaticDBBackup(reason = 'auto') {
    try {
        if (!fs.existsSync(DB_FILE)) return null;
        fs.mkdirSync(DB_AUTO_BACKUP_DIR, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const out = path.join(DB_AUTO_BACKUP_DIR, `medremind-${reason}-${ts}.db`);
        saveDB();
        fs.copyFileSync(DB_FILE, out);
        const keepMs = Math.max(1, DB_AUTO_BACKUP_KEEP_DAYS) * 86400000;
        for (const file of fs.readdirSync(DB_AUTO_BACKUP_DIR)) {
            if (!/^medremind-.*\.db$/.test(file)) continue;
            const full = path.join(DB_AUTO_BACKUP_DIR, file);
            const st = fs.statSync(full);
            if (Date.now() - st.mtimeMs > keepMs) fs.unlinkSync(full);
        }
        return out;
    } catch (e) {
        console.error('Automatic DB backup failed:', e.message);
        return null;
    }
}

function buildAdminSession(admin, req) {
    const sessionId = createRawToken();
    const expires = new Date(Date.now() + Math.max(1, ADMIN_APP_SESSION_HOURS) * 3600000).toISOString();
    const deviceId = String(req.headers['x-admin-device-id'] || req.body?.device_id || '').trim().slice(0, 120);
    const appVersion = String(req.body?.app_version || req.headers['x-admin-app-version'] || '').trim().slice(0, 40);
    dbRun(
        `INSERT INTO admin_app_sessions (session_id, admin_user_id, device_id, app_version, expires_at)
         VALUES (?,?,?,?,?)`,
        [sessionId, admin.id, deviceId || null, appVersion || null, expires]
    );
    return { sessionId, expires };
}

function verifyAdminAppSession(payload) {
    if (!payload?.adminApp || !payload?.session_id) return true;
    const row = dbGet(
        `SELECT id FROM admin_app_sessions
         WHERE session_id=? AND admin_user_id=? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
        [payload.session_id, payload.id]
    );
    if (!row) return false;
    dbRun('UPDATE admin_app_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE session_id=?', [payload.session_id]);
    return true;
}

function getAiScanUsage(userId, dateKey = taipeiDateKey()) {
    let row = dbGet('SELECT * FROM ai_scan_usage WHERE user_id=? AND usage_date=?', [userId, dateKey]);
    if (!row) {
        dbRun('INSERT INTO ai_scan_usage (user_id, usage_date) VALUES (?,?)', [userId, dateKey]);
        row = dbGet('SELECT * FROM ai_scan_usage WHERE user_id=? AND usage_date=?', [userId, dateKey]);
    }
    return row;
}

function aiScanQuotaSummary(userId, isPro = false) {
    const row = getAiScanUsage(userId);
    return {
        date: row.usage_date,
        active_pro: Boolean(isPro),
        free_used: Number(row.free_used || 0),
        free_limit: AI_SCAN_DAILY_FREE_LIMIT,
        free_remaining: Math.max(0, AI_SCAN_DAILY_FREE_LIMIT - Number(row.free_used || 0)),
        reward_used: Number(row.reward_used || 0),
        reward_limit: AI_SCAN_DAILY_REWARD_LIMIT,
        reward_remaining: Math.max(0, AI_SCAN_DAILY_REWARD_LIMIT - Number(row.reward_used || 0)),
        pro_used: Number(row.pro_used || 0)
    };
}

function consumeAiScanQuota(userId, isPro, accessType = 'free') {
    const type = String(accessType || 'free').toLowerCase();
    const row = getAiScanUsage(userId);
    if (isPro) {
        dbRun('UPDATE ai_scan_usage SET pro_used=COALESCE(pro_used,0)+1, updated_at=CURRENT_TIMESTAMP WHERE id=?', [row.id]);
        return { ok: true, type: 'pro' };
    }
    if (type === 'reward') {
        if (Number(row.reward_used || 0) >= AI_SCAN_DAILY_REWARD_LIMIT) return { ok: false, reason: 'reward_limit' };
        dbRun('UPDATE ai_scan_usage SET reward_used=COALESCE(reward_used,0)+1, updated_at=CURRENT_TIMESTAMP WHERE id=?', [row.id]);
        return { ok: true, type: 'reward' };
    }
    if (Number(row.free_used || 0) >= AI_SCAN_DAILY_FREE_LIMIT) return { ok: false, reason: 'free_limit' };
    dbRun('UPDATE ai_scan_usage SET free_used=COALESCE(free_used,0)+1, updated_at=CURRENT_TIMESTAMP WHERE id=?', [row.id]);
    return { ok: true, type: 'free' };
}

// 中間件
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
    },
    credentials: true
}));
app.use(express.json({ limit: '6mb' }));
app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
        return res.status(413).json({ error: '照片檔案太大，請改用較小照片或重新拍攝' });
    }
    next(err);
});
app.use('/api/', rateLimiter(API_RATE_LIMIT_PER_MIN));  // API 速率限制
app.get('/', (req, res, next) => {
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    if (host === 'www.yaojidecare.app') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        return res.sendFile(path.join(__dirname, 'public', 'website.html'));
    }
    next();
});
app.use((req, res, next) => {
    const pathname = decodeURIComponent(req.path || '');
    if (/(^|\/)\.env(?:\.|$)|\.(?:db|sqlite|sqlite3|log|p12|pem|key|mobileprovision|tar|tgz|gz|zip)$/i.test(pathname)) {
        return res.status(404).json({ error: 'Not found' });
    }
    next();
});
app.get(['/admin.html', '/admin'], (req, res) => {
    res.status(404).send('Not found');
});
app.use(express.static('public', {
    setHeaders(res, filePath) {
        const file = path.basename(filePath);
        if (file === 'index.html' || file === 'sw.js') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// JWT 認證
function auth(req, res, next) {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.status(401).json({ error: '請先登入' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        if (!verifyAdminAppSession(req.user)) return res.status(403).json({ error: '後台 App session 已失效，請重新驗證' });
        next();
    }
    catch (e) { res.status(403).json({ error: '登入已過期' }); }
}

function hasFamilyAccess(viewerId, targetUserId) {
    if (Number(viewerId) === Number(targetUserId)) return true;
    return !!dbGet(
        'SELECT id FROM family_members WHERE (user_id=? AND related_user_id=?) OR (user_id=? AND related_user_id=?)',
        [viewerId, targetUserId, targetUserId, viewerId]
    );
}

function createFamilyInviteCode() {
    for (let i = 0; i < 6; i++) {
        const code = crypto.randomBytes(6).toString('hex').toUpperCase();
        if (!dbGet('SELECT id FROM family_invites WHERE code=?', [code])) return code;
    }
    throw new Error('Unable to generate unique invite code');
}

function deleteUserData(uid) {
    dbRun('DELETE FROM medication_logs WHERE user_id=?', [uid]);
    dbRun('DELETE FROM medications WHERE user_id=?', [uid]);
    dbRun('DELETE FROM health_records WHERE user_id=?', [uid]);
    dbRun('DELETE FROM family_members WHERE user_id=? OR related_user_id=?', [uid, uid]);
    dbRun('DELETE FROM family_invites WHERE inviter_user_id=? OR used_by=?', [uid, uid]);
    dbRun('DELETE FROM family_messages WHERE sender_id=? OR target_user_id=?', [uid, uid]);
    dbRun('DELETE FROM notifications WHERE user_id=?', [uid]);
    dbRun('DELETE FROM push_tokens WHERE user_id=?', [uid]);
    dbRun('DELETE FROM subscriptions WHERE user_id=?', [uid]);
    dbRun('DELETE FROM ai_scan_usage WHERE user_id=?', [uid]);
    dbRun('DELETE FROM user_settings WHERE user_id=?', [uid]);
    dbRun('DELETE FROM medication_changes WHERE user_id=?', [uid]);
    dbRun('DELETE FROM users WHERE id=?', [uid]);
}

// ====== 初始化 ======
async function init() {
    const SQL = await initSqlJs();
    db = fs.existsSync(DB_FILE) ? new SQL.Database(fs.readFileSync(DB_FILE)) : new SQL.Database();
    
    const schema = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
    db.run(schema);
    
    // 補上可能缺失的欄位
    const migrations = [
        "ALTER TABLE medications ADD COLUMN is_active INTEGER DEFAULT 1",
        "ALTER TABLE medications ADD COLUMN total_quantity INTEGER",
        "ALTER TABLE medications ADD COLUMN remaining INTEGER",
        "ALTER TABLE medications ADD COLUMN daily_amount REAL DEFAULT 1",
        "ALTER TABLE medications ADD COLUMN refill_threshold INTEGER DEFAULT 7",
        "ALTER TABLE medications ADD COLUMN medication_image TEXT",
        "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
        "ALTER TABLE users ADD COLUMN device_identifier_hash TEXT",
        "ALTER TABLE users ADD COLUMN account_code TEXT",
        "ALTER TABLE users ADD COLUMN account_source TEXT DEFAULT 'email'",
        "ALTER TABLE users ADD COLUMN last_device_login_at DATETIME",
        "ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN email_verified_at DATETIME",
        "ALTER TABLE users ADD COLUMN email_verification_token_hash TEXT",
        "ALTER TABLE users ADD COLUMN email_verification_expires_at DATETIME",
        "ALTER TABLE users ADD COLUMN password_reset_token_hash TEXT",
        "ALTER TABLE users ADD COLUMN password_reset_expires_at DATETIME",
        `CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            plan TEXT DEFAULT 'free',
            entitlement TEXT,
            product_identifier TEXT,
            store TEXT,
            is_pro INTEGER DEFAULT 0,
            expires_at DATETIME,
            source TEXT,
            raw_customer_info TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        "ALTER TABLE subscriptions ADD COLUMN store TEXT",
        "ALTER TABLE subscriptions ADD COLUMN raw_customer_info TEXT",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)",
        `CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_user_id INTEGER,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INTEGER,
            summary TEXT,
            before_value TEXT,
            after_value TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        "CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin ON admin_audit_logs(admin_user_id)",
        `CREATE TABLE IF NOT EXISTS admin_app_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE NOT NULL,
            admin_user_id INTEGER NOT NULL,
            device_id TEXT,
            app_version TEXT,
            expires_at DATETIME NOT NULL,
            revoked_at DATETIME,
            last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        "CREATE INDEX IF NOT EXISTS idx_admin_app_sessions_admin ON admin_app_sessions(admin_user_id)",
        `CREATE TABLE IF NOT EXISTS ai_scan_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            usage_date DATE NOT NULL,
            free_used INTEGER DEFAULT 0,
            reward_used INTEGER DEFAULT 0,
            pro_used INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, usage_date)
        )`,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_scan_usage_user_date ON ai_scan_usage(user_id, usage_date)",
        "ALTER TABLE user_settings ADD COLUMN simple_mode INTEGER DEFAULT 0",
        "ALTER TABLE user_settings ADD COLUMN pin_code TEXT",
        "ALTER TABLE user_settings ADD COLUMN pin_enabled INTEGER DEFAULT 0",
        "ALTER TABLE user_settings ADD COLUMN height_cm REAL",
        "ALTER TABLE user_settings ADD COLUMN reminder_sound TEXT DEFAULT 'classic'",
        "ALTER TABLE user_settings ADD COLUMN desktop_mode INTEGER DEFAULT 0",
        "ALTER TABLE user_settings ADD COLUMN family_alert_delay_minutes INTEGER DEFAULT 60",
        "ALTER TABLE health_records ADD COLUMN sleep_hours REAL",
        "ALTER TABLE health_records ADD COLUMN mood TEXT",
        "ALTER TABLE notifications ADD COLUMN status TEXT DEFAULT 'unread'",
        "ALTER TABLE notifications ADD COLUMN snooze_until DATETIME",
        "ALTER TABLE notifications ADD COLUMN action_url TEXT",
        `CREATE TABLE IF NOT EXISTS push_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            platform TEXT DEFAULT 'unknown',
            device_id TEXT,
            app_version TEXT,
            enabled INTEGER DEFAULT 1,
            last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        "ALTER TABLE push_tokens ADD COLUMN app_version TEXT",
        "ALTER TABLE push_tokens ADD COLUMN enabled INTEGER DEFAULT 1",
        "ALTER TABLE push_tokens ADD COLUMN last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP",
        "ALTER TABLE push_tokens ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token)",
        "CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id)",
        `CREATE TABLE IF NOT EXISTS family_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inviter_user_id INTEGER NOT NULL,
            code TEXT UNIQUE NOT NULL,
            relationship TEXT DEFAULT '家人',
            expires_at DATETIME,
            used_by INTEGER,
            used_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_device_identifier_hash ON users(device_identifier_hash) WHERE device_identifier_hash IS NOT NULL",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_code ON users(account_code) WHERE account_code IS NOT NULL",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_family_members_pair ON family_members(user_id, related_user_id)"
    ];
    for (const migration of migrations) {
        try { db.run(migration); } catch(e) {}
    }
    dbRun(`UPDATE users
        SET email_verified=1, email_verified_at=COALESCE(email_verified_at, created_at)
        WHERE email_verified=0 AND email_verification_token_hash IS NULL`);
    saveDB();
    createAutomaticDBBackup('startup');
    setInterval(() => createAutomaticDBBackup('daily'), 24 * 3600000).unref?.();

    function logMedicationChange(userId, medicationId, drugName, changeType, beforeValue, afterValue) {
        dbRun(
            'INSERT INTO medication_changes (user_id, medication_id, drug_name, change_type, before_value, after_value) VALUES (?,?,?,?,?,?)',
            [userId, medicationId || null, drugName || null, changeType, beforeValue ? JSON.stringify(beforeValue) : null, afterValue ? JSON.stringify(afterValue) : null]
        );
    }

    function summarizeAdherence(userId, days = 7) {
        const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
        const logs = dbGet('SELECT COUNT(*) AS total, SUM(taken_status) AS taken FROM medication_logs WHERE user_id=? AND log_date >= ?', [userId, startDate]) || {};
        const total = logs.total || 0;
        const taken = logs.taken || 0;
        return { days, total, taken, missed: Math.max(0, total - taken), rate: total > 0 ? Math.round(taken / total * 100) : 100 };
    }

    function subscriptionCatalog() {
        return {
            entitlementId: SUBSCRIPTION_ENTITLEMENT_ID,
            planName: '藥護家 Pro',
            monthly: { productId: PRO_MONTHLY_PRODUCT_ID, price: 'NT$75/月' },
            yearly: { productId: PRO_YEARLY_PRODUCT_ID, price: 'NT$750/年' },
            features: ['無廣告', '更多 AI 藥袋辨識額度', '家人照護人數增加', '進階健康紀錄匯出與備份'],
            revenueCat: {
                iosApiKey: REVENUECAT_IOS_API_KEY,
                androidApiKey: REVENUECAT_ANDROID_API_KEY,
                configured: Boolean(REVENUECAT_IOS_API_KEY || REVENUECAT_ANDROID_API_KEY)
            }
        };
    }

    function isSubscriptionActive(row) {
        if (!row || Number(row.is_pro || 0) !== 1) return false;
        if (!row.expires_at) return true;
        return new Date(row.expires_at).getTime() > Date.now();
    }

    function planFromProduct(productIdentifier) {
        if (productIdentifier === PRO_YEARLY_PRODUCT_ID) return 'pro_yearly';
        if (productIdentifier === PRO_MONTHLY_PRODUCT_ID) return 'pro_monthly';
        return productIdentifier ? 'pro' : 'free';
    }

    function extractRevenueCatProStatus(customerInfo) {
        const entitlement = customerInfo?.entitlements?.active?.[SUBSCRIPTION_ENTITLEMENT_ID] || null;
        const productIdentifier = entitlement?.productIdentifier || entitlement?.product_identifier || '';
        const expiresAt = entitlement?.expirationDate || entitlement?.expiration_date || null;
        return {
            isPro: Boolean(entitlement),
            productIdentifier,
            expiresAt,
            store: entitlement?.store || customerInfo?.originalAppUserId || ''
        };
    }

    async function sendVerificationEmail(user) {
        const rawToken = createRawToken();
        const link = `${APP_BASE_URL}/api/verify-email?token=${encodeURIComponent(rawToken)}`;
        dbRun(
            'UPDATE users SET email_verification_token_hash=?, email_verification_expires_at=? WHERE id=?',
            [hashToken(rawToken), expiresAt(EMAIL_VERIFY_TTL_MINUTES), user.id]
        );
        saveDB();
        await sendEmail({
            to: user.email,
            subject: '請驗證您的藥護家 Email',
            html: authMailTemplate(
                '驗證您的藥護家帳號',
                `${user.name || '您好'}，請點擊下方按鈕完成 Email 驗證，完成後即可登入藥護家。`,
                '完成 Email 驗證',
                link,
                `此驗證連結將於 ${EMAIL_VERIFY_TTL_MINUTES} 分鐘後失效。`
            )
        });
    }

    async function sendPasswordResetEmail(user) {
        const rawToken = createRawToken();
        const link = `${APP_BASE_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
        dbRun(
            'UPDATE users SET password_reset_token_hash=?, password_reset_expires_at=? WHERE id=?',
            [hashToken(rawToken), expiresAt(PASSWORD_RESET_TTL_MINUTES), user.id]
        );
        saveDB();
        await sendEmail({
            to: user.email,
            subject: '重設您的藥護家密碼',
            html: authMailTemplate(
                '重設您的藥護家密碼',
                `${user.name || '您好'}，請點擊下方按鈕設定新密碼。如果不是您本人操作，可以忽略這封信。`,
                '設定新密碼',
                link,
                `此重設連結將於 ${PASSWORD_RESET_TTL_MINUTES} 分鐘後失效。`
            )
        });
    }

    function buildMedicationRisk(meds) {
        const text = meds.map(m => `${m.drug_name} ${m.usage_notes || ''}`).join(' ').toLowerCase();
        const risks = [];
        if (/warfarin|抗凝血|阿斯匹靈|aspirin/.test(text)) risks.push('抗凝血或阿斯匹靈相關用藥，若出現黑便、異常瘀青或出血，請盡快詢問醫師。');
        if (/安眠|zolpidem|嗜睡|頭暈|暈眩|肌肉鬆弛/.test(text)) risks.push('部分用藥可能造成嗜睡或頭暈，服藥後避免開車、騎車或操作機械。');
        if (/糖尿|降血糖|metformin|glibenclamide/.test(text)) risks.push('血糖相關用藥需留意低血糖症狀，建議規律飲食並追蹤血糖。');
        if (/降血脂|atorvastatin|rosuvastatin/.test(text)) risks.push('降血脂藥若出現明顯肌肉痠痛或深色尿，請向醫師或藥師確認。');
        if (/葡萄柚|grapefruit/.test(text)) risks.push('目前用藥須留意葡萄柚交互作用，避免自行搭配。');
        if (meds.length >= 5) risks.push('目前同時記錄多種用藥，回診時建議出示就診報告讓醫師/藥師確認。');
        return risks.length ? risks : ['目前未從記錄中發現明顯高風險提示；仍請依醫囑服用，任何不適請詢問醫師或藥師。'];
    }
    
    // 清理過期用藥：end_date 已過的就軟刪除（設為停用）
    function cleanupExpiredMeds() {
        const today = new Date().toISOString().split('T')[0];
        // 軟刪除：標記為停用而非刪除
        dbRun('UPDATE medications SET is_active=0 WHERE end_date IS NOT NULL AND end_date < ? AND is_active=1', [today]);
    }
    cleanupExpiredMeds();
    
    const uc = dbGet('SELECT COUNT(*) AS c FROM users');
    if ((!uc || !uc.c || uc.c === 0) && CREATE_DEMO_DATA) {
        const h1 = hashPwd('123456'), h2 = hashPwd('123456');
        dbRun('INSERT INTO users (name,email,phone,password_hash,age) VALUES (?,?,?,?,?)', ['王大明','wang@example.com','0912-345-678',h1,65]);
        dbRun('INSERT INTO users (name,email,phone,password_hash,age) VALUES (?,?,?,?,?)', ['李小華','li@example.com','0923-456-789',h2,42]);
        dbRun("INSERT INTO medications (user_id,drug_name,dosage,usage_notes,remind_time) VALUES (?,?,?,?,?)", [1,'高血壓藥','1顆','飯後服用','["08:00","20:00"]']);
        dbRun("INSERT INTO medications (user_id,drug_name,dosage,usage_notes,remind_time) VALUES (?,?,?,?,?)", [1,'糖尿病藥','1顆','飯前服用','["07:00","19:00"]']);
        dbRun("INSERT INTO medications (user_id,drug_name,dosage,usage_notes,remind_time) VALUES (?,?,?,?,?)", [1,'膽固醇藥','0.5顆','睡前服用','["21:00"]']);
        dbRun("INSERT INTO medications (user_id,drug_name,dosage,usage_notes,remind_time) VALUES (?,?,?,?,?)", [2,'血壓藥','1顆','早餐後','["08:00"]']);
        dbRun("INSERT INTO health_records (user_id,record_date,blood_pressure_sys,blood_pressure_dia,blood_sugar,weight) VALUES (?,?,?,?,?,?)", [1,'2026-06-14',135,85,120,72.5]);
        dbRun("INSERT INTO health_records (user_id,record_date,blood_pressure_sys,blood_pressure_dia,blood_sugar,weight) VALUES (?,?,?,?,?,?)", [1,'2026-06-13',130,82,115,72.3]);
        dbRun("INSERT INTO health_records (user_id,record_date,blood_pressure_sys,blood_pressure_dia,blood_sugar,weight) VALUES (?,?,?,?,?,?)", [1,'2026-06-12',140,88,125,72.8]);
        dbRun("INSERT INTO family_members (user_id,related_user_id,relationship,permission_level) VALUES (?,?,?,?)", [1,2,'子女','view']);
        dbRun("INSERT INTO family_members (user_id,related_user_id,relationship,permission_level) VALUES (?,?,?,?)", [2,1,'父母','edit']);
        for (const d of [
            ['高血壓藥','amlodipine','高血壓治療','頭暈、水腫、心悸','每日1顆','飯後服用，勿飲酒','心血管'],
            ['糖尿病藥','metformin','第二型糖尿病控制','腸胃不適、腹瀉、食慾不振','每日1-2顆','飯前30分鐘服用，監測血糖','代謝'],
            ['膽固醇藥','atorvastatin','高膽固醇治療','肌肉疼痛、肝功能異常、頭痛','每日1顆','睡前服用，定期檢查肝功能','心血管'],
            ['胃腸藥','omeprazole','胃酸過多、胃潰瘍','頭痛、腹瀉、便秘','每日1顆','早餐前30分鐘服用','消化系統'],
            ['止痛藥','acetaminophen','輕度至中度疼痛','肝功能損害(過量)、過敏','需要時1-2顆','每4-6小時一次，一日不超過4次','止痛'],
            ['降血糖藥','glibenclamide','第二型糖尿病','低血糖、體重增加','每日1-2顆','飯前服用，隨餐調整','代謝'],
            ['降血脂藥','rosuvastatin','高膽固醇血症','肌肉痠痛、頭暈','每日1顆','晚上服用效果較佳','心血管'],
            ['抗凝血藥','warfarin','預防血栓','出血、瘀青','依醫囑調整','定時服藥，監測凝血功能','心血管'],
            ['甲狀腺藥','levothyroxine','甲狀腺功能低下','心悸、失眠、體重減輕','每日1顆','空腹服用，與其他藥物隔4小時','內分泌'],
            ['氣喘吸入劑','albuterol','支氣管痙攣','心跳加速、手抖','需要時1-2吸','急性發作時使用，間隔4小時','呼吸系統'],
            ['安眠藥','zolpidem','失眠','嗜睡、頭暈、夢遊','睡前1顆','睡前服用，服用後勿開車','神經系統'],
            ['抗憂鬱藥','fluoxetine','憂鬱症、焦慮','噁心、失眠、性功能障礙','每日1顆','早晨服用，需持續服用數週','神經系統'],
            ['抗生素','amoxicillin','細菌感染','腹瀉、皮疹、過敏','每日2-3顆','飯後服用，完整療程吃完','抗感染'],
            ['過敏藥','cetirizine','過敏性鼻炎、蕁麻疹','嗜睡、口乾','每日1顆','睡前服用較佳，避免飲酒','抗過敏'],
            ['消炎藥','ibuprofen','發炎、疼痛、發燒','胃痛、胃出血、腎功能影響','需要時1-2顆','飯後服用，避免與酒精併用','止痛消炎'],
            ['鈣片','calcium carbonate','骨質疏鬆、鈣質補充','便秘、脹氣','每日1-2顆','飯後服用吸收較佳','營養補充'],
            ['維生素B群','vitamin B complex','神經炎、疲勞','尿液變黃(正常)','每日1顆','早餐後服用','營養補充'],
            ['眼藥水','artificial tears','眼睛乾澀','暫時性視力模糊','需要時1-2滴','開封後一個月內用完','眼科'],
            ['軟便劑','sennoside','便秘','腹瀉、腹痛','睡前1-2顆','睡前服用，勿長期使用','消化系統'],
            ['利尿劑','furosemide','水腫、高血壓','頻尿、電解質不平衡','每日1顆','早晨服用，避免夜間頻尿','心血管'],
            ['心律不整藥','propranolol','心律不整、高血壓','疲倦、手腳冰冷','每日1-2顆','定時服藥，勿突然停藥','心血管'],
            ['痛風藥','allopurinol','痛風、高尿酸','皮疹、肝功能異常','每日1顆','飯後服用，多喝水','代謝'],
            ['骨鬆藥','alendronate','骨質疏鬆症','胃灼熱、吞嚥困難','每週1顆','空腹服用，配一大杯水，服後30分鐘勿躺下','骨骼'],
            ['止咳藥','dextromethorphan','乾咳','嗜睡、噁心','需要時1-2顆','飯後服用，避免開車','呼吸系統'],
            ['化痰藥','acetylcysteine','痰液黏稠','噁心、嘔吐','每日2-3顆','飯後服用，多喝水','呼吸系統'],
            ['抗癲癇藥','carbamazepine','癲癇、三叉神經痛、躁鬱症','頭暈、嗜睡、白血球減少、低血鈉','每日1-3顆','飯後服用，勿飲酒，避免開車','神經系統'],
            ['癲通長效錠','carbamazepine CR','癲癇、三叉神經痛','頭暈、嗜睡、視覺模糊','每日1-2顆','可剝半不可嚼碎，飯後服用','神經系統'],
            ['阿茲海默藥','donepezil','阿茲海默症','噁心、腹瀉、失眠','每日1顆','睡前服用','神經系統'],
            ['帕金森藥','levodopa/carbidopa','帕金森氏症','噁心、頭暈、異動症','每日2-4顆','空腹或飯後皆可，避免高蛋白飲食','神經系統'],
            ['類固醇','prednisolone','發炎、過敏、氣喘','水腫、胃痛、血糖升高','每日1-4顆','飯後服用，勿突然停藥','內分泌'],
            ['攝護腺藥','tamsulosin','良性攝護腺肥大','頭暈、姿勢性低血壓','每日1顆','飯後服用，睡前服用較佳','泌尿'],
            ['暈眩藥','betahistine','梅尼爾氏症、眩暈','頭痛、胃部不適','每日2-3顆','飯後服用','神經系統'],
            ['肌肉鬆弛劑','baclofen','肌肉痙攣','嗜睡、頭暈、肌肉無力','每日2-3顆','飯後服用，避免開車','神經系統'],
            ['心臟藥','digoxin','心臟衰竭、心律不整','噁心、視覺異常、心律不整','每日1顆','定時服藥，監測脈搏','心血管']
        ]) dbRun("INSERT INTO drug_database (drug_name,generic_name,indications,side_effects,dosage_common,usage_notes,category) VALUES (?,?,?,?,?,?,?)", d);
        saveDB();
        console.log('✅ 測試數據已建立');
    }

    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
        const adminEmail = normalizeEmail(ADMIN_EMAIL);
        const existingAdmin = dbGet('SELECT id FROM users WHERE email=?', [adminEmail]);
        if (existingAdmin) {
            dbRun("UPDATE users SET name=?, password_hash=?, role='admin', email_verified=1, email_verified_at=COALESCE(email_verified_at, CURRENT_TIMESTAMP), email_verification_token_hash=NULL, email_verification_expires_at=NULL WHERE id=?", [ADMIN_NAME, hashPwd(ADMIN_PASSWORD), existingAdmin.id]);
        } else {
            dbRun("INSERT INTO users (name,email,password_hash,role,email_verified,email_verified_at) VALUES (?,?,?,'admin',1,CURRENT_TIMESTAMP)", [ADMIN_NAME, adminEmail, hashPwd(ADMIN_PASSWORD)]);
        }
        saveDB();
        console.log('✅ 管理員帳號已設定');
    }
    // setInterval(saveDB, 30000); // 暫停定時保存
    
    // ====== 用戶 API ======
    app.post('/api/device-login', (req, res) => {
        const deviceId = String(req.body.device_id || '').trim();
        const platform = String(req.body.platform || 'web').trim().substring(0, 40);
        const model = String(req.body.model || '').trim().substring(0, 80);
        const displayName = String(req.body.name || '').trim().substring(0, 60);

        if (!/^[A-Za-z0-9._:-]{8,160}$/.test(deviceId)) {
            return res.status(400).json({ error: '裝置識別碼無效' });
        }

        const deviceHash = hashDeviceIdentifier(deviceId);
        let user = dbGet('SELECT * FROM users WHERE device_identifier_hash=?', [deviceHash]);

        if (!user) {
            if (!displayName) {
                return res.status(409).json({
                    error: '第一次使用請先輸入用戶名稱',
                    require_name: true
                });
            }
            const email = `device-${deviceHash.slice(0, 20)}@device.yaojidecare.local`;
            const name = displayName;
            const inserted = dbRun(
                `INSERT INTO users
                    (name,email,phone,password_hash,role,email_verified,email_verified_at,device_identifier_hash,account_source,last_device_login_at)
                 VALUES (?,?,?,?, 'user', 1, CURRENT_TIMESTAMP, ?, 'device', CURRENT_TIMESTAMP)`,
                [name, email, null, hashPwd(crypto.randomBytes(24).toString('hex')), deviceHash]
            );
            const id = inserted ? inserted.id : null;
            if (!id) return res.status(500).json({ error: '建立裝置帳號失敗' });
            const accountCode = makeAccountCode(id);
            dbRun('UPDATE users SET account_code=?, name=? WHERE id=?', [accountCode, `${name} ${accountCode}`, id]);
            user = dbGet('SELECT * FROM users WHERE id=?', [id]);
        } else {
            dbRun('UPDATE users SET last_device_login_at=CURRENT_TIMESTAMP WHERE id=?', [user.id]);
            if (!user.account_code) {
                dbRun('UPDATE users SET account_code=? WHERE id=?', [makeAccountCode(user.id), user.id]);
            }
            user = dbGet('SELECT * FROM users WHERE id=?', [user.id]);
        }

        dbRun('INSERT INTO user_settings (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING', [user.id]);
        saveDB();

        const token = jwt.sign(
            { id: user.id, name: user.name, email: user.email, role: user.role || 'user', device: true },
            JWT_SECRET,
            { expiresIn: '365d' }
        );
        res.json({
            message: '裝置登入成功',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: publicEmail(user),
                phone: user.phone,
                age: user.age,
                role: user.role || 'user',
                account_code: user.account_code || makeAccountCode(user.id),
                account_source: user.account_source || 'device',
                platform,
                model
            }
        });
    });

    app.post('/api/register', async (req, res) => {
        const { name, phone, password, age } = req.body;
        const email = normalizeEmail(req.body.email);
        if (!name || !email || !password) return res.status(400).json({ error: '姓名、Email 和密碼為必填' });
        if (password.length < 6) return res.status(400).json({ error: '密碼至少需要6位' });
        if (dbGet('SELECT id FROM users WHERE email = ?', [email])) return res.status(400).json({ error: '此 Email 已被註冊' });
        if (phone && dbGet('SELECT id FROM users WHERE phone = ?', [phone])) return res.status(400).json({ error: '此手機號碼已被註冊' });
        try {
            const hash = hashPwd(password);
            const inserted = dbRun(
                'INSERT INTO users (name,email,phone,password_hash,age,email_verified) VALUES (?,?,?,?,?,0)',
                [name, email, phone||null, hash, age||null]
            );
            const id = inserted ? inserted.id : null;
            if (!id) return res.status(500).json({ error: '註冊失敗，請重試' });
            await sendVerificationEmail({ id, name, email });
            res.json({ message:'註冊成功，請到信箱完成 Email 驗證後再登入' });
        } catch (e) {
            console.error('Register email send failed:', e);
            res.status(500).json({ error: '註冊失敗或驗證信寄送失敗，請稍後再試' });
        }
    });
    
    app.post('/api/login', (req, res) => {
        const email = normalizeEmail(req.body.email);
        const { password } = req.body;
        if (!email || !password) return res.status(400).json({ error: '請輸入 Email 和密碼' });
        const u = dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!u || !verifyPwd(password, u.password_hash)) return res.status(401).json({ error: 'Email 或密碼錯誤' });
        if ((u.role || 'user') !== 'admin' && !u.email_verified) {
            return res.status(403).json({ error: '請先到信箱完成 Email 驗證後再登入' });
        }
        if (isLegacyHash(u.password_hash)) {
            dbRun('UPDATE users SET password_hash=? WHERE id=?', [hashPwd(password), u.id]);
            saveDB();
        }
        const token = jwt.sign({ id:u.id, name:u.name, email:u.email, role: u.role || 'user' }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ message:'登入成功', token, user:{ id:u.id, name:u.name, email:u.email, phone:u.phone, age:u.age, role: u.role || 'user' } });
    });

    app.post('/api/admin/app-session', (req, res) => {
        const bootstrapToken = req.headers['x-admin-app-token'] || req.body?.bootstrapToken || '';
        if (!ADMIN_APP_BOOTSTRAP_TOKEN && !ADMIN_APP_BOOTSTRAP_TOKEN_HASH) {
            return res.status(503).json({ error: '後台 App 尚未設定啟動憑證' });
        }
        if (!verifyAdminAppBootstrapToken(bootstrapToken)) {
            return res.status(403).json({ error: '後台 App 驗證失敗' });
        }
        const admin = (ADMIN_EMAIL && dbGet('SELECT * FROM users WHERE email=? AND role=?', [normalizeEmail(ADMIN_EMAIL), 'admin']))
            || dbGet('SELECT * FROM users WHERE role=? ORDER BY id LIMIT 1', ['admin']);
        if (!admin) return res.status(500).json({ error: '找不到管理員帳號' });
        const session = buildAdminSession(admin, req);
        const token = jwt.sign(
            { id: admin.id, name: admin.name, email: admin.email, role: 'admin', adminApp: true, session_id: session.sessionId },
            JWT_SECRET,
            { expiresIn: `${Math.max(1, ADMIN_APP_SESSION_HOURS)}h` }
        );
        logAdminAction({ ...req, user: { id: admin.id } }, 'admin_app_session.create', {
            targetType: 'admin_app_session',
            summary: '後台 App 建立短效 session',
            after: { expires_at: session.expires, device_id: req.headers['x-admin-device-id'] || req.body?.device_id || null }
        });
        saveDB();
        res.json({
            message: '後台 App 驗證成功',
            token,
            expires_at: session.expires,
            user: {
                id: admin.id,
                name: admin.name || ADMIN_NAME,
                email: publicEmail(admin),
                role: 'admin'
            }
        });
    });

    app.post('/api/resend-verification', async (req, res) => {
        const email = normalizeEmail(req.body.email);
        if (!email) return res.status(400).json({ error: '請輸入 Email' });
        const u = dbGet('SELECT id,name,email,email_verified FROM users WHERE email=?', [email]);
        if (u && !u.email_verified) {
            try { await sendVerificationEmail(u); }
            catch (e) { console.error('Resend verification failed:', e); }
        }
        res.json({ message: '如果此 Email 尚未驗證，系統已寄出新的驗證信' });
    });

    app.get('/api/verify-email', (req, res) => {
        const token = String(req.query.token || '');
        const tokenHash = token ? hashToken(token) : '';
        const u = tokenHash ? dbGet('SELECT id,name FROM users WHERE email_verification_token_hash=?', [tokenHash]) : null;
        const invalidPage = (message, status = 400) => res.status(status).send(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>驗證失敗</title><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;line-height:1.7;"><h2>驗證失敗</h2><p>${escapeHTML(message)}</p><p><a href="/">回到藥護家</a></p></body></html>`);
        if (!u) return invalidPage('驗證連結無效，請重新註冊或重新寄送驗證信。');
        const valid = dbGet('SELECT id FROM users WHERE id=? AND email_verification_expires_at > ?', [u.id, new Date().toISOString()]);
        if (!valid) return invalidPage('驗證連結已過期，請回到登入頁重新寄送驗證信。');
        dbRun('UPDATE users SET email_verified=1, email_verified_at=CURRENT_TIMESTAMP, email_verification_token_hash=NULL, email_verification_expires_at=NULL WHERE id=?', [u.id]);
        saveDB();
        res.send(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email 已驗證</title><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;line-height:1.7;"><h2>Email 已驗證完成</h2><p>${escapeHTML(u.name)}，您的藥護家帳號已可登入。</p><p><a href="/" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">回到藥護家登入</a></p></body></html>`);
    });
    
    app.get('/api/user/profile', auth, (req, res) => {
        const u = dbGet('SELECT id,name,email,phone,age,role,account_code,account_source FROM users WHERE id=?', [req.user.id]);
        if (u) u.email = publicEmail(u);
        res.json(u ? { user:u } : { error:'用戶不存在' });
    });

    app.post('/api/push/register', auth, (req, res) => {
        const token = String(req.body.token || '').trim();
        if (!token || token.length < 20 || token.length > 4096) {
            return res.status(400).json({ error: '推播 token 無效' });
        }
        const platform = normalizePushPlatform(req.body.platform);
        const deviceId = String(req.body.device_id || '').trim().slice(0, 180) || null;
        const appVersion = String(req.body.app_version || '').trim().slice(0, 40) || null;
        dbRun(
            `INSERT INTO push_tokens (user_id, token, platform, device_id, app_version, enabled, last_seen_at, updated_at)
             VALUES (?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
             ON CONFLICT(token) DO UPDATE SET
                user_id=excluded.user_id,
                platform=excluded.platform,
                device_id=excluded.device_id,
                app_version=excluded.app_version,
                enabled=1,
                last_seen_at=CURRENT_TIMESTAMP,
                updated_at=CURRENT_TIMESTAMP`,
            [req.user.id, token, platform, deviceId, appVersion]
        );
        saveDB();
        res.json({ message: '推播裝置已註冊', firebase_ready: !!getFirebaseMessaging() });
    });

    app.post('/api/push/unregister', auth, (req, res) => {
        const token = String(req.body.token || '').trim();
        if (token) dbRun('UPDATE push_tokens SET enabled=0, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND token=?', [req.user.id, token]);
        else dbRun('UPDATE push_tokens SET enabled=0, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [req.user.id]);
        saveDB();
        res.json({ message: '推播裝置已停用' });
    });

    app.post('/api/push/test', auth, async (req, res) => {
        const result = await sendPushToUser(req.user.id, {
            title: '藥護家測試通知',
            body: '這是一則 App 原生推播測試。',
            data: { type: 'push_test', action_url: '/#home' }
        });
        res.json({ message: result.sent > 0 ? '測試推播已送出' : '目前尚未送出推播', result });
    });
    
    // ====== 用藥 API ======
    app.get('/api/medications', auth, (req, res) => {
        cleanupExpiredMeds();
        const meds = dbAll('SELECT * FROM medications WHERE user_id=? AND is_active=1 ORDER BY created_at DESC', [req.user.id]);
        const today = new Date().toISOString().split('T')[0];
        const withStatus = meds.map(m => {
            let times = [];
            try { times = JSON.parse(m.remind_time); if (!Array.isArray(times)) times = []; } catch(e) { times = []; }
            const durationDaysLeft = m.end_date ? Math.max(0, Math.ceil((new Date(m.end_date) - new Date()) / 86400000)) : null;
            const stockDaysLeft = m.remaining !== null && m.remaining !== undefined && Number(m.daily_amount || 0) > 0
                ? Math.floor(Number(m.remaining || 0) / Number(m.daily_amount || 1))
                : null;
            const daysLeft = stockDaysLeft !== null ? stockDaysLeft : durationDaysLeft;
            return { ...m, days_left: daysLeft, today_status: times.map(t => {
                const l = dbGet('SELECT taken_status FROM medication_logs WHERE medication_id=? AND remind_time=? AND log_date=?', [m.id, t, today]);
                return { time:t, taken: !!(l && l.taken_status) };
            })};
        });
        res.json({ medications:withStatus });
    });
    
    app.post('/api/medications', auth, (req, res) => {
        const { drug_name, dosage, usage_notes, remind_time, duration_days, total_quantity, remaining, daily_amount, refill_threshold, medication_image } = req.body;
        const cleanName = String(drug_name || '').trim().slice(0, 120);
        const cleanDosage = String(dosage || '').trim().slice(0, 120);
        const times = normalizeReminderTimes(remind_time);
        if (!cleanName || !cleanDosage || !times) return res.status(400).json({ error:'藥名、劑量和有效提醒時間為必填' });
        const days = parseOptionalInt(duration_days, { min: 1, max: 3650 });
        const total = parseOptionalInt(total_quantity, { min: 0, max: 100000 });
        const remain = remaining !== undefined && remaining !== null && remaining !== ''
            ? parseOptionalInt(remaining, { min: 0, max: 100000 })
            : total;
        const daily = parseOptionalNumber(daily_amount, { min: 0.1, max: 1000 }) ?? 1;
        const threshold = parseOptionalInt(refill_threshold, { min: 1, max: 3650 }) ?? 7;
        if ([days, total, remain, daily, threshold].some(Number.isNaN)) return res.status(400).json({ error:'用藥天數、庫存與提醒門檻格式不正確' });
        const image = normalizeMedicationImage(medication_image);
        if (image === false) return res.status(400).json({ error:'藥品圖片格式不正確' });
        const endDate = days ? new Date(Date.now() + days * 86400000).toISOString().split('T')[0] : null;
        dbRun('INSERT INTO medications (user_id,drug_name,dosage,usage_notes,remind_time,duration_days,end_date,total_quantity,remaining,daily_amount,refill_threshold,medication_image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [req.user.id, cleanName, cleanDosage, String(usage_notes || '').trim().slice(0, 500), JSON.stringify(times), days, endDate, total, remain, daily, threshold, image]);
        const newMed = dbGet('SELECT last_insert_rowid() AS id');
        logMedicationChange(req.user.id, newMed?.id, cleanName, 'created', null, { drug_name: cleanName, dosage: cleanDosage, usage_notes, remind_time: times, duration_days: days, total_quantity: total, remaining: remain });
        saveDB();
        res.json({
            message: '用藥已添加',
            end_date: endDate,
            medication: {
                id: newMed?.id,
                drug_name: cleanName,
                dosage: cleanDosage,
                remind_time: times,
                duration_days: days,
                end_date: endDate
            }
        });
    });
    
    app.put('/api/medications/:id', auth, (req, res) => {
        const { drug_name, dosage, usage_notes, remind_time, duration_days, total_quantity, remaining, daily_amount, refill_threshold, medication_image } = req.body;
        const before = dbGet('SELECT * FROM medications WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
        if (!before) return res.status(404).json({ error:'用藥記錄不存在' });
        const cleanName = String(drug_name || '').trim().slice(0, 120);
        const cleanDosage = String(dosage || '').trim().slice(0, 120);
        const times = normalizeReminderTimes(remind_time);
        if (!cleanName || !cleanDosage || !times) return res.status(400).json({ error:'藥名、劑量和有效提醒時間為必填' });
        const days = parseOptionalInt(duration_days, { min: 1, max: 3650 });
        const total = parseOptionalInt(total_quantity, { min: 0, max: 100000 });
        const remain = parseOptionalInt(remaining, { min: 0, max: 100000 });
        const daily = parseOptionalNumber(daily_amount, { min: 0.1, max: 1000 }) ?? 1;
        const threshold = parseOptionalInt(refill_threshold, { min: 1, max: 3650 }) ?? 7;
        if ([days, total, remain, daily, threshold].some(Number.isNaN)) return res.status(400).json({ error:'用藥天數、庫存與提醒門檻格式不正確' });
        const image = normalizeMedicationImage(medication_image);
        if (image === false) return res.status(400).json({ error:'藥品圖片格式不正確' });
        const endDate = days ? new Date(Date.now() + days * 86400000).toISOString().split('T')[0] : null;
        dbRun('UPDATE medications SET drug_name=?,dosage=?,usage_notes=?,remind_time=?,duration_days=?,end_date=?,total_quantity=?,remaining=?,daily_amount=?,refill_threshold=?,medication_image=COALESCE(?, medication_image) WHERE id=?',
            [cleanName,cleanDosage,String(usage_notes || '').trim().slice(0, 500),JSON.stringify(times),days,endDate,total,remain,daily,threshold, image, req.params.id]);
        logMedicationChange(req.user.id, req.params.id, cleanName || before.drug_name, 'updated', before, { drug_name: cleanName, dosage: cleanDosage, usage_notes, remind_time: times, duration_days: days, total_quantity: total, remaining: remain, daily_amount: daily, refill_threshold: threshold });
        saveDB();
        res.json({
            message: '用藥已更新',
            end_date: endDate,
            medication: {
                id: Number(req.params.id),
                drug_name: cleanName,
                dosage: cleanDosage,
                remind_time: times,
                duration_days: days,
                end_date: endDate
            }
        });
    });
    
    app.delete('/api/medications/:id', auth, (req, res) => {
        const before = dbGet('SELECT * FROM medications WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
        if (!before) return res.status(404).json({ error:'用藥記錄不存在' });
        logMedicationChange(req.user.id, req.params.id, before.drug_name, 'deleted', before, null);
        dbRun('DELETE FROM medications WHERE id=?', [req.params.id]);
        dbRun('DELETE FROM medication_logs WHERE medication_id=?', [req.params.id]);
        saveDB();
        res.json({ message:'用藥已刪除' });
    });
    
    // ====== 打卡 API ======
    app.post('/api/medications/:id/take', auth, (req, res) => {
        const { remind_time } = req.body;
        const today = new Date().toISOString().split('T')[0];
        const med = dbGet('SELECT * FROM medications WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
        if (!med) return res.status(404).json({ error:'用藥記錄不存在' });
        const ex = dbGet('SELECT id FROM medication_logs WHERE medication_id=? AND remind_time=? AND log_date=?', [req.params.id, remind_time, today]);
        if (ex) dbRun('UPDATE medication_logs SET taken_status=1,taken_at=? WHERE id=?', [new Date().toISOString(), ex.id]);
        else dbRun('INSERT INTO medication_logs (user_id,medication_id,remind_time,taken_status,taken_at,log_date) VALUES (?,?,?,1,?,?)', [req.user.id, req.params.id, remind_time, new Date().toISOString(), today]);
        dbRun('UPDATE medications SET remaining = CASE WHEN remaining > 0 THEN remaining - 1 ELSE 0 END WHERE id=? AND user_id=? AND remaining IS NOT NULL', [req.params.id, req.user.id]);
        saveDB();
        res.json({ message:'已打卡', drug_name:med.drug_name, time:remind_time });
    });
    
    app.get('/api/medications/today-status', auth, (req, res) => {
        const today = new Date().toISOString().split('T')[0];
        const meds = dbAll('SELECT * FROM medications WHERE user_id=?', [req.user.id]);
        let total=0, taken=0;
        const details = meds.map(m => {
            const times = JSON.parse(m.remind_time).map(t => {
                total++;
                const l = dbGet('SELECT taken_status FROM medication_logs WHERE medication_id=? AND remind_time=? AND log_date=?', [m.id, t, today]);
                const ok = !!(l && l.taken_status);
                if (ok) taken++;
                return { time:t, taken:ok, drug_name:m.drug_name };
            });
            return { medication_id:m.id, drug_name:m.drug_name, dosage:m.dosage, times };
        });
        res.json({ today, total_reminders:total, taken_count:taken, adherence_rate: total>0 ? Math.round(taken/total*100):100, details });
    });
    
    // ====== 用藥排程 ======
    app.get('/api/medications/today-schedule', auth, (req, res) => {
        const today = new Date().toISOString().split('T')[0];
        const n = new Date();
        const ct = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
        const meds = dbAll('SELECT * FROM medications WHERE user_id=?', [req.user.id]);
        const sched = [];
        meds.forEach(m => {
            let times = [];
            try { times = JSON.parse(m.remind_time); if (!Array.isArray(times)) times = []; } catch(e) { times = []; }
            times.forEach(t => {
                const l = dbGet('SELECT taken_status FROM medication_logs WHERE medication_id=? AND remind_time=? AND log_date=?', [m.id, t, today]);
                sched.push({ medication_id:m.id, drug_name:m.drug_name, dosage:m.dosage, medication_image:m.medication_image || null, time:t, taken:!!(l&&l.taken_status), is_past:t<=ct, is_current:t===ct });
            });
        });
        sched.sort((a,b)=>a.time.localeCompare(b.time));
        res.json({ today, current_time:ct, schedule:sched });
    });
    
    app.get('/api/medications/log-history', auth, (req, res) => {
        const d30 = new Date(Date.now()-30*86400000).toISOString().split('T')[0];
        const logs = dbAll("SELECT ml.*, m.drug_name FROM medication_logs ml JOIN medications m ON ml.medication_id=m.id WHERE ml.user_id=? AND ml.log_date>=? ORDER BY ml.log_date DESC, ml.remind_time DESC", [req.user.id, d30]);
        const bd = {};
        logs.forEach(l => {
            if (!bd[l.log_date]) bd[l.log_date] = { taken:0, missed:0, total:0, details:[] };
            bd[l.log_date].total++;
            l.taken_status ? bd[l.log_date].taken++ : bd[l.log_date].missed++;
            bd[l.log_date].details.push(l);
        });
        res.json({ history:bd });
    });
    
    // ====== 健康數據 API ======
    app.get('/api/health', auth, (req, res) => {
        const d30 = new Date(Date.now()-30*86400000).toISOString().split('T')[0];
        res.json({ records: dbAll('SELECT * FROM health_records WHERE user_id=? AND record_date>=? ORDER BY record_date DESC', [req.user.id, d30]) });
    });
    
    app.post('/api/health', auth, (req, res) => {
        const { blood_pressure_sys, blood_pressure_dia, blood_sugar, weight, sleep_hours, mood, notes } = req.body;
        const bpSys = parseOptionalInt(blood_pressure_sys, { min: 50, max: 260 });
        const bpDia = parseOptionalInt(blood_pressure_dia, { min: 30, max: 160 });
        const sugar = parseOptionalNumber(blood_sugar, { min: 20, max: 600 });
        const bodyWeight = parseOptionalNumber(weight, { min: 1, max: 300 });
        const sleep = parseOptionalNumber(sleep_hours, { min: 0, max: 24 });
        if ([bpSys, bpDia, sugar, bodyWeight, sleep].some(Number.isNaN)) {
            return res.status(400).json({ error: '健康數據超出合理範圍' });
        }
        if ((bpSys && !bpDia) || (!bpSys && bpDia)) {
            return res.status(400).json({ error: '血壓需同時填寫收縮壓與舒張壓' });
        }
        if (!bpSys && !bpDia && sugar === null && bodyWeight === null && sleep === null && !mood && !notes) {
            return res.status(400).json({ error: '請至少填寫一項健康數據' });
        }
        const d = new Date().toISOString().split('T')[0];
        const ex = dbGet('SELECT id FROM health_records WHERE user_id=? AND record_date=?', [req.user.id, d]);
        if (ex) dbRun('UPDATE health_records SET blood_pressure_sys=?,blood_pressure_dia=?,blood_sugar=?,weight=?,sleep_hours=?,mood=?,notes=? WHERE id=?', [bpSys,bpDia,sugar,bodyWeight,sleep,mood||null,notes||null,ex.id]);
        else dbRun('INSERT INTO health_records (user_id,record_date,blood_pressure_sys,blood_pressure_dia,blood_sugar,weight,sleep_hours,mood,notes) VALUES (?,?,?,?,?,?,?,?,?)', [req.user.id,d,bpSys,bpDia,sugar,bodyWeight,sleep,mood||null,notes||null]);
        saveDB();
        res.json({ message: ex ? '健康數據已更新':'健康數據已記錄' });
    });
    
    app.get('/api/health/summary', auth, (req, res) => {
        const rs = dbAll('SELECT * FROM health_records WHERE user_id=? ORDER BY record_date DESC LIMIT 30', [req.user.id]);
        if (!rs.length) return res.json({ summary:null });
        const lt = rs[0];
        res.json({ summary:{
            latest_bp: lt.blood_pressure_sys ? `${lt.blood_pressure_sys}/${lt.blood_pressure_dia}`:null,
            latest_sugar: lt.blood_sugar, latest_weight: lt.weight,
            avg_bp_sys: Math.round(rs.filter(r=>r.blood_pressure_sys).reduce((a,b)=>a+b.blood_pressure_sys,0)/rs.filter(r=>r.blood_pressure_sys).length)||null,
            total_records: rs.length
        }});
    });
    
    // ====== 家庭 API ======
    app.get('/api/family', auth, (req, res) => {
        const members = dbAll("SELECT fm.*, u.name,u.email,u.phone,u.age FROM family_members fm JOIN users u ON fm.related_user_id=u.id WHERE fm.user_id=?", [req.user.id])
            .map(member => ({ ...member, email: publicEmail(member) }));
        res.json({ members });
    });

    app.delete('/api/family/:relatedUserId', auth, (req, res) => {
        const relatedUserId = parseInt(req.params.relatedUserId);
        if (!relatedUserId || relatedUserId === req.user.id) return res.status(400).json({ error: '家人資料無效' });
        const member = dbGet('SELECT id FROM family_members WHERE user_id=? AND related_user_id=?', [req.user.id, relatedUserId]);
        if (!member) return res.status(404).json({ error: '找不到此家人或無權限刪除' });

        dbRun('DELETE FROM family_members WHERE (user_id=? AND related_user_id=?) OR (user_id=? AND related_user_id=?)',
            [req.user.id, relatedUserId, relatedUserId, req.user.id]);
        dbRun('DELETE FROM family_invites WHERE (inviter_user_id=? AND used_by=?) OR (inviter_user_id=? AND used_by=?)',
            [req.user.id, relatedUserId, relatedUserId, req.user.id]);
        dbRun('DELETE FROM family_messages WHERE (sender_id=? AND target_user_id=?) OR (sender_id=? AND target_user_id=?)',
            [req.user.id, relatedUserId, relatedUserId, req.user.id]);
        saveDB();
        res.json({ message: '已刪除家人關係' });
    });
    
    app.post('/api/family/add', auth, (req, res) => {
        const email = normalizeEmail(req.body.email);
        const relationship = normalizeFamilyRelationship(req.body.relationship);
        if (!email) return res.status(400).json({ error:'請輸入家人 Email' });
        const ru = dbGet('SELECT id,name,email FROM users WHERE email=?', [email]);
        if (!ru || !ru.id) return res.status(404).json({ error:'找不到此用戶' });
        if (ru.id===req.user.id) return res.status(400).json({ error:'不能加入自己' });
        if (dbGet('SELECT id FROM family_members WHERE user_id=? AND related_user_id=?', [req.user.id, ru.id])) return res.status(400).json({ error:'此家人已在清單中' });
        const sub = dbGet('SELECT * FROM subscriptions WHERE user_id=?', [req.user.id]);
        const memberCount = dbGet('SELECT COUNT(*) AS c FROM family_members WHERE user_id=?', [req.user.id])?.c || 0;
        if (!isSubscriptionActive(sub) && memberCount >= 1) return res.status(403).json({ error: '免費版最多 1 位家人照護；升級 Pro 可加入多位家人' });
        dbRun('INSERT INTO family_members (user_id,related_user_id,relationship,permission_level) VALUES (?,?,?,?)', [req.user.id, ru.id, relationship, 'view']);
        const rr = inverseFamilyRelationship(relationship);
        if (!dbGet('SELECT id FROM family_members WHERE user_id=? AND related_user_id=?', [ru.id, req.user.id]))
            dbRun('INSERT INTO family_members (user_id,related_user_id,relationship,permission_level) VALUES (?,?,?,?)', [ru.id, req.user.id, rr, 'view']);
        saveDB();
        res.json({ message:'已加入家庭成員', member:{ name:ru.name, email: publicEmail(ru), relationship } });
    });

    app.post('/api/family/invite', auth, (req, res) => {
        const relationship = normalizeFamilyRelationship(req.body.relationship);
        const sub = dbGet('SELECT * FROM subscriptions WHERE user_id=?', [req.user.id]);
        const isPro = isSubscriptionActive(sub);
        const memberCount = dbGet('SELECT COUNT(*) AS c FROM family_members WHERE user_id=?', [req.user.id])?.c || 0;
        if (!isPro && memberCount >= 1) return res.status(403).json({ error: '免費版最多 1 位家人照護；升級 Pro 可邀請多位家人' });
        dbRun('DELETE FROM family_invites WHERE inviter_user_id=? AND used_by IS NULL AND expires_at IS NOT NULL AND expires_at < ?', [req.user.id, new Date().toISOString()]);
        const active = dbGet('SELECT COUNT(*) AS c FROM family_invites WHERE inviter_user_id=? AND used_by IS NULL AND (expires_at IS NULL OR expires_at >= ?)', [req.user.id, new Date().toISOString()]);
        const inviteLimit = isPro ? 10 : 1;
        if ((active?.c || 0) >= inviteLimit) return res.status(429).json({ error: '有效邀請碼太多，請等舊邀請過期後再產生' });
        const code = createFamilyInviteCode();
        const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
        dbRun('INSERT INTO family_invites (inviter_user_id, code, relationship, expires_at) VALUES (?,?,?,?)', [req.user.id, code, relationship, expiresAt]);
        saveDB();
        res.json({
            code,
            relationship,
            expires_at: expiresAt,
            invite_url: `${APP_BASE_URL}/?invite=${encodeURIComponent(code)}`
        });
    });

    app.post('/api/family/invite/accept', auth, (req, res) => {
        const code = String(req.body.code || '').trim().toUpperCase();
        if (!code) return res.status(400).json({ error: '請輸入邀請碼' });
        const invite = dbGet('SELECT * FROM family_invites WHERE code=?', [code]);
        if (!invite) return res.status(404).json({ error: '邀請碼不存在' });
        if (invite.used_by) return res.status(400).json({ error: '邀請碼已使用' });
        if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return res.status(400).json({ error: '邀請碼已過期' });
        if (invite.inviter_user_id === req.user.id) return res.status(400).json({ error: '不能加入自己' });
        const inviter = dbGet('SELECT id,name,email FROM users WHERE id=?', [invite.inviter_user_id]);
        if (!inviter) return res.status(404).json({ error: '邀請人不存在' });
        const inviterSeesAcceptedAs = normalizeFamilyRelationship(invite.relationship);
        const acceptedSeesInviterAs = inverseFamilyRelationship(inviterSeesAcceptedAs);
        if (!dbGet('SELECT id FROM family_members WHERE user_id=? AND related_user_id=?', [req.user.id, inviter.id])) {
            dbRun('INSERT INTO family_members (user_id, related_user_id, relationship, permission_level) VALUES (?,?,?,?)', [req.user.id, inviter.id, acceptedSeesInviterAs, 'view']);
        }
        if (!dbGet('SELECT id FROM family_members WHERE user_id=? AND related_user_id=?', [inviter.id, req.user.id])) {
            dbRun('INSERT INTO family_members (user_id, related_user_id, relationship, permission_level) VALUES (?,?,?,?)', [inviter.id, req.user.id, inviterSeesAcceptedAs, 'view']);
        }
        dbRun('UPDATE family_invites SET used_by=?, used_at=CURRENT_TIMESTAMP WHERE id=?', [req.user.id, invite.id]);
        dbRun('INSERT INTO notifications (user_id, type, title, message, is_read, status, action_url) VALUES (?,?,?,?,0,?,?)',
            [inviter.id, 'family_joined', '👨‍👩‍👧 家人已加入', `${req.user.name || req.user.email} 已透過邀請碼加入照護`, 'unread', '#family']);
        saveDB();
        res.json({ message: '已加入家人照護', inviter: { ...inviter, email: publicEmail(inviter) } });
    });
    
    app.get('/api/family/:fid/medications', auth, (req, res) => {
        const fm = dbGet('SELECT id FROM family_members WHERE user_id=? AND related_user_id=?', [req.user.id, req.params.fid]);
        if (!fm) return res.status(403).json({ error:'無權限查看' });
        const today = new Date().toISOString().split('T')[0];
        const meds = dbAll(`
            SELECT id, drug_name, dosage, usage_notes, remind_time, duration_days, end_date,
                   total_quantity, remaining, daily_amount, refill_threshold, is_active, created_at
            FROM medications
            WHERE user_id=? AND COALESCE(is_active,1)=1
            ORDER BY created_at DESC
        `, [req.params.fid]);
        let total=0, taken=0;
        const medications = meds.map(m => {
            let times = [];
            try { times = JSON.parse(m.remind_time); if (!Array.isArray(times)) times = []; } catch(e) { times = []; }
            let todayTotal = 0;
            let todayTaken = 0;
            times.forEach(t => {
                total++;
                todayTotal++;
                const l = dbGet('SELECT taken_status FROM medication_logs WHERE medication_id=? AND remind_time=? AND log_date=?', [m.id, t, today]);
                if (l&&l.taken_status) {
                    taken++;
                    todayTaken++;
                }
            });
            const remaining = m.remaining === null || m.remaining === undefined ? null : Number(m.remaining);
            const dailyAmount = Number(m.daily_amount || 1) || 1;
            const daysLeft = remaining === null ? null : Math.floor(remaining / dailyAmount);
            return {
                id: m.id,
                drug_name: m.drug_name,
                dosage: m.dosage,
                usage_notes: m.usage_notes,
                remind_time: times,
                duration_days: m.duration_days,
                end_date: m.end_date,
                total_quantity: m.total_quantity,
                remaining: m.remaining,
                daily_amount: m.daily_amount,
                refill_threshold: m.refill_threshold,
                days_left: daysLeft,
                today_total: todayTotal,
                today_taken: todayTaken,
                today_done: todayTotal > 0 && todayTaken >= todayTotal
            };
        });
        const famMem = dbGet('SELECT id,name FROM users WHERE id=?', [req.params.fid]);
        res.json({
            family_member:famMem,
            today,
            adherence_rate:total>0?Math.round(taken/total*100):100,
            total_reminders:total,
            taken_count:taken,
            medications
        });
    });
    
    // ====== 通知 API ======
    app.get('/api/notifications', auth, (req, res) => {
        const rows = dbAll(`
            SELECT * FROM notifications
            WHERE user_id=?
              AND (snooze_until IS NULL OR snooze_until <= CURRENT_TIMESTAMP)
            ORDER BY
              CASE status WHEN 'unread' THEN 0 WHEN 'snoozed' THEN 1 WHEN 'read' THEN 2 ELSE 3 END,
              created_at DESC
            LIMIT 50
        `, [req.user.id]);
        const unread = dbGet("SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND COALESCE(status,'unread')='unread'", [req.user.id]);
        res.json({ notifications: rows, unread: unread ? unread.c : 0 });
    });
    
    app.put('/api/notifications/:id/read', auth, (req, res) => {
        dbRun("UPDATE notifications SET is_read=1, status='read' WHERE id=? AND user_id=?", [req.params.id, req.user.id]); saveDB();
        res.json({ message:'已標記為已讀' });
    });

    app.put('/api/notifications/read-all', auth, (req, res) => {
        dbRun("UPDATE notifications SET is_read=1, status='read', snooze_until=NULL WHERE user_id=? AND COALESCE(status,'unread') IN ('unread','snoozed')", [req.user.id]);
        saveDB();
        res.json({ message: '已全部標記為已讀' });
    });

    app.put('/api/notifications/:id/status', auth, (req, res) => {
        const status = ['unread', 'read', 'done', 'snoozed'].includes(req.body.status) ? req.body.status : 'read';
        const snoozeMinutes = parseInt(req.body.snooze_minutes) || 0;
        const snoozeUntil = status === 'snoozed' ? new Date(Date.now() + snoozeMinutes * 60000).toISOString() : null;
        dbRun('UPDATE notifications SET is_read=?, status=?, snooze_until=? WHERE id=? AND user_id=?',
            [status === 'unread' ? 0 : 1, status, snoozeUntil, req.params.id, req.user.id]);
        saveDB();
        res.json({ message: '通知狀態已更新' });
    });
    
    // ====== 藥物庫 API ======
    app.get('/api/drugs/search', auth, (req, res) => {
        const q = req.query.q;
        res.json({ drugs: q ? dbAll("SELECT * FROM drug_database WHERE drug_name LIKE ? OR generic_name LIKE ? LIMIT 10", ['%'+q+'%', '%'+q+'%']) : [] });
    });
    
    app.get('/api/drugs/categories', auth, (req, res) => {
        res.json({ categories: dbAll('SELECT DISTINCT category FROM drug_database ORDER BY category').map(c=>c.category) });
    });
    
    // ====== 拍照辨識藥物 API ======
    const multer = require('multer');
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
    
    app.post('/api/drugs/scan', auth, upload.single('image'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: '請上傳照片' });
        
        // OCR 辨識：提取照片中的文字
        const Tesseract = require('tesseract.js');
        try {
            const { data: { text } } = await Tesseract.recognize(req.file.buffer, 'chi_tra+eng');
            const ocrText = text.trim();
            
            if (!ocrText || ocrText.length < 2) {
                return res.json({ success: false, message: '照片中未辨識到文字，請重新拍照', candidates: [] });
            }
            
            // 用 OCR 文字比對藥物資料庫
            const allDrugs = dbAll('SELECT * FROM drug_database');
            const candidates = allDrugs.filter(d => {
                const searchText = ocrText.toLowerCase();
                return d.drug_name.toLowerCase().includes(searchText) ||
                       (d.generic_name && d.generic_name.toLowerCase().includes(searchText)) ||
                       searchText.includes(d.drug_name.toLowerCase()) ||
                       (d.generic_name && searchText.includes(d.generic_name.toLowerCase()));
            }).slice(0, 5).map(d => ({
                id: d.id,
                drug_name: d.drug_name,
                generic_name: d.generic_name,
                dosage_common: d.dosage_common,
                usage_notes: d.usage_notes,
                side_effects: d.side_effects,
                category: d.category
            }));
            
            // 若 OCR 辨識到部分藥名，用模糊比對
            if (candidates.length === 0 && ocrText.length >= 2) {
                const chars = ocrText.replace(/\s/g, '');
                const fuzzy = [];
                for (const d of allDrugs) {
                    const dn = d.drug_name.replace(/\s/g, '');
                    let m = 0;
                    for (const c of chars) { if (dn.includes(c)) m++; }
                    if (m >= Math.min(chars.length - 1, 2)) {
                        fuzzy.push({ id: d.id, drug_name: d.drug_name, generic_name: d.generic_name, dosage_common: d.dosage_common, usage_notes: d.usage_notes, side_effects: d.side_effects, category: d.category, confidence: Math.round(m / dn.length * 100) });
                        if (fuzzy.length >= 5) break;
                    }
                }
                
                if (fuzzy.length > 0) {
                    return res.json({
                        success: true,
                        ocr_text: ocrText,
                        message: '辨識到文字「' + ocrText + '」，找到 ' + fuzzy.length + ' 筆可能藥物',
                        candidates: fuzzy
                    });
                }
            }
            
            res.json({
                success: candidates.length > 0,
                ocr_text: ocrText,
                message: candidates.length > 0 
                    ? '辨識到文字「' + ocrText + '」，找到 ' + candidates.length + ' 筆可能藥物' 
                    : '辨識到文字「' + ocrText + '」，但未找到相符藥物，請手動輸入',
                candidates: candidates
            });
        } catch (err) {
            console.error('OCR 錯誤:', err);
            res.status(500).json({ error: '辨識失敗：' + err.message });
        }
    });
    
    // 純文字掃描（用於服用須知、副作用等欄位）
    app.post('/api/drugs/scan-text', auth, upload.single('image'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: '請上傳照片' });
        const Tesseract = require('tesseract.js');
        try {
            const { data: { text } } = await Tesseract.recognize(req.file.buffer, 'chi_tra+eng');
            const clean = text.trim().replace(/\n/g, '，').replace(/\s+/g, ' ').substring(0, 200);
            res.json({ text: clean || null });
        } catch (err) {
            res.status(500).json({ error: '辨識失敗' });
        }
    });
    
    // ====== AI 精準辨識藥物 API（Gemini Vision）======
    const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

    app.get('/api/ai-scan/quota', auth, (req, res) => {
        const sub = dbGet('SELECT * FROM subscriptions WHERE user_id=?', [req.user.id]);
        res.json({ quota: aiScanQuotaSummary(req.user.id, isSubscriptionActive(sub)) });
    });
    
    app.post('/api/drugs/ai-scan', auth, upload.single('image'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: '請上傳照片' });
        if (!GEMINI_API_KEY) return res.status(503).json({ error: 'AI 識別服務尚未設定' });
        const sub = dbGet('SELECT * FROM subscriptions WHERE user_id=?', [req.user.id]);
        const quota = consumeAiScanQuota(req.user.id, isSubscriptionActive(sub), req.body?.access_type || 'free');
        if (!quota.ok) {
            const summary = aiScanQuotaSummary(req.user.id, isSubscriptionActive(sub));
            return res.status(429).json({
                error: quota.reason === 'reward_limit' ? '今日廣告兌換 AI 掃描已用完' : '今日免費 AI 掃描已用完',
                quota: summary
            });
        }
        
        try {
            const base64 = req.file.buffer.toString('base64');
            const mimeType = req.file.mimetype || 'image/jpeg';
            
            const prompt = `你是一個專業的藥袋辨識助手。請仔細分析這張台灣醫院/藥局的藥袋照片，提取以下資訊。

重要規則：
- JSON 字串內不可有換行，多行文字請用「；」分隔
- 藥袋上通常有中文藥名和英文藥名
- 用法用量通常寫「每日X次」「每次X粒」「飯前/飯後/睡前」
- 提醒時間用24小時制，如08:00、12:00、20:00
- 只回傳純 JSON

{"drug_name":"藥品中文名稱","drug_name_en":"藥品英文名稱(無則null)","dosage":"每次劑量","frequency":"每日次數","timing":"服用時間說明","remind_times":["08:00","12:00","20:00"],"side_effects":"副作用(無則null)","notes":"服用須知(無則null)","usage_raw":"藥袋上的用法用量原文"}`;

            const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType, data: base64 } }
                        ]
                    }],
                    generationConfig: { 
                        temperature: 0, 
                        maxOutputTokens: 4096
                    }
                })
            });
            
            if (!response.ok) {
                const errText = await response.text();
                console.error('Gemini API 錯誤:', response.status, errText);
                if (response.status === 403 && /leaked|API key/i.test(errText)) {
                    throw new Error('Gemini API Key 已失效，請更換新的 API Key');
                }
                throw new Error(`Gemini API 回應 ${response.status}`);
            }
            
            const result = await response.json();
            const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            // 清理 JSON
            let cleanJSON = rawText.trim();
            // 去掉 markdown 包裝
            cleanJSON = cleanJSON.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
            
            let parsed;
            try {
                parsed = JSON.parse(cleanJSON);
            } catch (e1) {
                // 移除所有換行再試
                const noNewlines = cleanJSON.replace(/\n/g, ' ').replace(/\r/g, '').replace(/  +/g, ' ');
                try {
                    parsed = JSON.parse(noNewlines);
                } catch (e2) {
                    console.log('JSON 解析失敗，原始:', rawText.substring(0, 600));
                    throw e2;
                }
            }
            
            console.log('Gemini 解析成功');
            
            res.json({
                success: true,
                method: 'ai',
                quota: aiScanQuotaSummary(req.user.id, isSubscriptionActive(sub)),
                ai_result: {
                    drug_name: parsed.drug_name || '',
                    drug_name_en: parsed.drug_name_en || null,
                    dosage: parsed.dosage || '',
                    frequency: parsed.frequency || '',
                    timing: parsed.timing || '',
                    remind_times: parsed.remind_times || [],
                    side_effects: parsed.side_effects || null,
                    notes: parsed.notes || null,
                    usage_raw: parsed.usage_raw || ''
                }
            });
            
        } catch (err) {
            console.error('AI 掃描錯誤:', err.message);
            // AI 失敗時 fallback 到 OCR
            res.json({
                success: false,
                method: 'ai',
                error: err.message,
                quota: aiScanQuotaSummary(req.user.id, isSubscriptionActive(sub)),
                message: 'AI 辨識失敗，請改用一般掃描'
            });
        }
    });
    
    // ====== 藥物交互作用 API ======
    app.post('/api/drugs/check-interaction', auth, (req, res) => {
        const { generic_name } = req.body;
        if (!generic_name) return res.json({ warnings: [] });
        const userDrugs = dbAll("SELECT DISTINCT generic_name FROM drug_database WHERE id IN (SELECT id FROM medications WHERE user_id=?)", [req.user.id]);
        // 查詢已知交互作用
        const warnings = [];
        const interactionPairs = {
            'warfarin': { drugs: ['aspirin','ibuprofen','acetaminophen'], desc: '增加出血風險' },
            'metformin': { drugs: ['furosemide'], desc: '可能影響血糖控制' },
            'digoxin': { drugs: ['furosemide','omeprazole'], desc: '可能增加心律不整風險' },
            'atorvastatin': { drugs: ['warfarin','digoxin'], desc: '可能增加肌肉病變風險' },
            'carbamazepine': { drugs: ['warfarin','zolpidem','fluoxetine'], desc: '可能降低藥效' },
            'levothyroxine': { drugs: ['omeprazole','calcium carbonate'], desc: '減少甲狀腺素吸收，需隔4小時' },
            'ibuprofen': { drugs: ['warfarin','furosemide','aspirin'], desc: '增加腸胃出血及腎臟風險' },
            'fluoxetine': { drugs: ['warfarin','carbamazepine','zolpidem'], desc: '可能增加血清素症候群風險' },
            'amlodipine': { drugs: ['warfarin','digoxin'], desc: '可能影響血壓控制' },
        };
        userDrugs.forEach(ud => {
            if (interactionPairs[generic_name] && interactionPairs[generic_name].drugs.includes(ud.generic_name)) {
                warnings.push({ drug: ud.generic_name, severity: 'high', description: interactionPairs[generic_name].desc });
            }
            if (interactionPairs[ud.generic_name] && interactionPairs[ud.generic_name].drugs.includes(generic_name)) {
                warnings.push({ drug: ud.generic_name, severity: 'high', description: interactionPairs[ud.generic_name].desc });
            }
        });
        res.json({ warnings });
    });
    
    // ====== 用戶設定 API ======
    app.get('/api/settings', auth, (req, res) => {
        let s = dbGet('SELECT * FROM user_settings WHERE user_id=?', [req.user.id]);
        if (!s) { dbRun('INSERT INTO user_settings (user_id) VALUES (?)', [req.user.id]); s = dbGet('SELECT * FROM user_settings WHERE user_id=?', [req.user.id]) || { reminder_repeat: 0, telegram_chat_id: null }; }
        const settings = {
            reminder_repeat: s.reminder_repeat || 0,
            telegram_chat_id: s.telegram_chat_id || null,
            height_cm: s.height_cm || null,
            simple_mode: s.simple_mode || 0,
            reminder_sound: s.reminder_sound || 'classic',
            desktop_mode: 0,
            family_alert_delay_minutes: s.family_alert_delay_minutes || 60,
            bp_sys_goal: s.bp_sys_goal || null,
            bp_dia_goal: s.bp_dia_goal || null,
            sugar_goal: s.sugar_goal || null,
            weight_goal: s.weight_goal || null
        };
        res.json({ settings, ...settings });
    });
    
    app.put('/api/settings', auth, (req, res) => {
        const { reminder_repeat, telegram_chat_id, height_cm, reminder_sound, family_alert_delay_minutes } = req.body;
        let s = dbGet('SELECT id FROM user_settings WHERE user_id=?', [req.user.id]);
        const sound = reminder_sound || 'classic';
        const delay = parseInt(family_alert_delay_minutes) || 60;
        if (!s) dbRun('INSERT INTO user_settings (user_id,reminder_repeat,telegram_chat_id,height_cm,reminder_sound,desktop_mode,family_alert_delay_minutes) VALUES (?,?,?,?,?,?,?)', [req.user.id, reminder_repeat||0, telegram_chat_id||null, height_cm || null, sound, 0, delay]);
        else dbRun('UPDATE user_settings SET reminder_repeat=?,telegram_chat_id=?,height_cm=COALESCE(?, height_cm),reminder_sound=?,desktop_mode=0,family_alert_delay_minutes=? WHERE user_id=?', [reminder_repeat||0, telegram_chat_id||null, height_cm || null, sound, delay, req.user.id]);
        saveDB();
        res.json({ message: '設定已更新' });
    });

    app.post('/api/support/report', auth, async (req, res) => {
        const category = String(req.body.category || '使用問題').trim().slice(0, 80);
        const message = String(req.body.message || '').trim().slice(0, 2000);
        const contact = String(req.body.contact || '').trim().slice(0, 120);
        const pageUrl = String(req.body.page_url || '').trim().slice(0, 500);
        const userAgent = String(req.body.user_agent || '').trim().slice(0, 500);
        const currentPage = String(req.body.current_page || '').trim().slice(0, 80);
        const activeModal = String(req.body.active_modal || '').trim().slice(0, 120);
        const activityTrail = Array.isArray(req.body.activity_trail)
            ? req.body.activity_trail.slice(-30).map(item => ({
                time: compactReportValue(item?.time, 40),
                type: compactReportValue(item?.type, 40),
                label: compactReportValue(item?.label, 160),
                page: compactReportValue(item?.page, 80),
                modal: compactReportValue(item?.modal, 120),
                details: item?.details && typeof item.details === 'object'
                    ? Object.fromEntries(
                        Object.entries(item.details)
                            .filter(([k]) => !/password|token|secret|authorization/i.test(String(k)))
                            .slice(0, 8)
                            .map(([k, v]) => [compactReportValue(k, 40), compactReportValue(v, 160)])
                    )
                    : {}
            }))
            : [];

        if (message.length < 10) return res.status(400).json({ error: '請至少輸入 10 個字的問題內容' });
        if (!ADMIN_EMAIL) return res.status(503).json({ error: '問題回報信箱尚未設定' });

        const user = dbGet('SELECT id,name,email,phone,account_code,account_source,created_at FROM users WHERE id=?', [req.user.id]) || {};
        const publicUserEmail = publicEmail(user) || '';
        const subjectCategory = category || '使用問題';

        try {
            await sendEmail({
                to: ADMIN_EMAIL,
                subject: `藥護家問題回報：${subjectCategory}`,
                html: `
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#1f2937;">
                        <h2 style="margin:0 0 16px;color:#0f766e;">藥護家問題回報</h2>
                        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px;margin-bottom:16px;">
                            <div><b>類型：</b>${escapeHTML(subjectCategory)}</div>
                            <div><b>送出時間：</b>${escapeHTML(new Date().toISOString())}</div>
                        </div>
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
                            <h3 style="margin:0 0 8px;color:#111827;">問題內容</h3>
                            <div style="white-space:pre-wrap;line-height:1.7;">${escapeHTML(message)}</div>
                        </div>
                        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin-bottom:16px;font-size:14px;line-height:1.8;">
                            <h3 style="margin:0 0 8px;color:#1e40af;">使用者當時狀態</h3>
                            <div><b>目前頁面：</b>${escapeHTML(currentPage || '未提供')}</div>
                            <div><b>目前彈窗：</b>${escapeHTML(activeModal || '無')}</div>
                            <div style="margin-top:10px;"><b>最近操作：</b></div>
                            ${
                                activityTrail.length
                                    ? '<ol style="margin:6px 0 0 20px;padding:0;">' + activityTrail.map(item => {
                                        const details = Object.entries(item.details || {})
                                            .map(([k, v]) => `${escapeHTML(k)}=${escapeHTML(v)}`)
                                            .join('，');
                                        return `<li style="margin:4px 0;"><span style="color:#64748b;">${escapeHTML(item.time)}</span> · ${escapeHTML(item.type)} · ${escapeHTML(item.label)} <span style="color:#64748b;">${escapeHTML(item.page || '')}${item.modal ? ' / ' + escapeHTML(item.modal) : ''}${details ? ' · ' + details : ''}</span></li>`;
                                    }).join('') + '</ol>'
                                    : '<div style="color:#64748b;">未提供最近操作紀錄</div>'
                            }
                        </div>
                        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;font-size:14px;line-height:1.8;">
                            <div><b>使用者：</b>${escapeHTML(user.name || req.user.name || '')}</div>
                            <div><b>裝置編號：</b>${escapeHTML(user.account_code || '')}</div>
                            <div><b>User ID：</b>${escapeHTML(user.id || req.user.id)}</div>
                            <div><b>Email：</b>${escapeHTML(publicUserEmail || '裝置帳號未提供')}</div>
                            <div><b>電話：</b>${escapeHTML(user.phone || '未提供')}</div>
                            <div><b>聯絡方式：</b>${escapeHTML(contact || '未填')}</div>
                            <div><b>頁面：</b>${escapeHTML(pageUrl || '未提供')}</div>
                            <div><b>瀏覽器：</b>${escapeHTML(userAgent || '未提供')}</div>
                        </div>
                    </div>`
            });
            res.json({ message: '問題回報已送出，謝謝您的回饋' });
        } catch (error) {
            console.error('Support report email failed:', error);
            res.status(500).json({ error: '問題回報寄送失敗，請稍後再試' });
        }
    });
    
    // ====== 家人未吃藥通知 ======
    app.get('/api/family/check-missed', auth, async (req, res) => {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const ct = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const family = dbAll('SELECT fm.related_user_id, u.name FROM family_members fm JOIN users u ON fm.related_user_id=u.id WHERE fm.user_id=?', [req.user.id]);
        const missedList = [];
        family.forEach(f => {
            const meds = dbAll('SELECT * FROM medications WHERE user_id=?', [f.related_user_id]);
            meds.forEach(m => {
                let times = [];
                try { times = JSON.parse(m.remind_time); if (!Array.isArray(times)) times = []; } catch(e) { times = []; }
                times.forEach(t => {
                    if (t < ct) {
                        const log = dbGet('SELECT taken_status FROM medication_logs WHERE medication_id=? AND remind_time=? AND log_date=?', [m.id, t, today]);
                        if (!log || !log.taken_status) {
                            const item = { name: f.name, drug_name: m.drug_name, time: t };
                            missedList.push(item);
                            const msg = `${f.name} 錯過了 ${t} 的 ${m.drug_name}`;
                            const existed = dbGet('SELECT id FROM notifications WHERE user_id=? AND type=? AND message=? AND created_at LIKE ?', [req.user.id, 'missed_alert', msg, today + '%']);
                            if (!existed) {
                                dbRun(
                                    'INSERT INTO notifications (user_id, type, title, message, is_read, status, action_url) VALUES (?,?,?,?,0,?,?)',
                                    [req.user.id, 'missed_alert', '⚠️ 家人未吃藥', msg, 'unread', '/#family']
                                );
                                sendPushToUser(req.user.id, {
                                    title: '家人未吃藥',
                                    body: msg,
                                    data: {
                                        type: 'missed_alert',
                                        action_url: '/#family',
                                        related_user_id: f.related_user_id,
                                        medication_id: m.id,
                                        remind_time: t
                                    }
                                }).catch(e => console.error('Family push failed:', e.message));
                            }
                        }
                    }
                });
            });
        });
        if (missedList.length > 0) saveDB();
        res.json({ missed: missedList });
    });
    
    // ====== 健康數據趨勢 API ======
    app.get('/api/health/trend', auth, (req, res) => {
        const days = parseInt(req.query.days) || 30;
        const type = req.query.type;
        const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
        const records = dbAll('SELECT * FROM health_records WHERE user_id=? AND record_date>=? ORDER BY record_date ASC', [req.user.id, since]);
        if (type) {
            return res.json({ trend: records.map(r => ({
                date: r.record_date,
                systolic: r.blood_pressure_sys,
                diastolic: r.blood_pressure_dia,
                blood_sugar: r.blood_sugar,
                weight: r.weight
            })) });
        }
        const trend = {
            dates: records.map(r => r.record_date),
            bp_sys: records.map(r => r.blood_pressure_sys),
            bp_dia: records.map(r => r.blood_pressure_dia),
            sugar: records.map(r => r.blood_sugar),
            weight: records.map(r => r.weight)
        };
        res.json({ trend });
    });

    // ====== 管理員 API ======
    function adminAuth(req, res, next) {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: '無管理權限' });
        }
        next();
    }

    function adminSegmentCondition(segment) {
        const key = String(segment || '').trim();
        if (key === 'all_users') return { where: "COALESCE(u.role,'user')!='admin'", params: [] };
        if (key === 'pro') return { where: "COALESCE(u.role,'user')!='admin' AND COALESCE(s.is_pro,0)=1 AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)", params: [] };
        if (key === 'no_push') return { where: "COALESCE(u.role,'user')!='admin' AND NOT EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id=u.id AND pt.enabled=1)", params: [] };
        if (key === 'low_adherence') {
            const d7 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
            return {
                where: `COALESCE(u.role,'user')!='admin'
                    AND (SELECT COUNT(*) FROM medication_logs ml WHERE ml.user_id=u.id AND ml.log_date>=?) > 0
                    AND ((SELECT COALESCE(SUM(taken_status),0) FROM medication_logs ml WHERE ml.user_id=u.id AND ml.log_date>=?) * 100.0 /
                         (SELECT COUNT(*) FROM medication_logs ml WHERE ml.user_id=u.id AND ml.log_date>=?)) < 75`,
                params: [d7, d7, d7]
            };
        }
        if (key === 'many_unread') return { where: "COALESCE(u.role,'user')!='admin' AND (SELECT COUNT(*) FROM notifications n WHERE n.user_id=u.id AND COALESCE(n.status,'unread')='unread') >= 5", params: [] };
        if (key === 'inactive_7d') {
            const d7 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
            return { where: "COALESCE(u.role,'user')!='admin' AND NOT EXISTS (SELECT 1 FROM medication_logs ml WHERE ml.user_id=u.id AND ml.log_date>=?)", params: [d7] };
        }
        return { where: '', params: [] };
    }

    function loadAdminSegmentUsers(segment, limit = 200) {
        const cond = adminSegmentCondition(segment);
        if (!cond.where) return [];
        return dbAll(`
            SELECT u.id, u.name
            FROM users u
            LEFT JOIN subscriptions s ON s.user_id=u.id
            WHERE ${cond.where}
            ORDER BY u.created_at DESC
            LIMIT ?`, [...cond.params, Math.min(500, Math.max(1, Number(limit || 200)))]);
    }

    // 管理員儀表板摘要
    app.get('/api/admin/stats', auth, adminAuth, (req, res) => {
        const totalUsers = dbGet('SELECT COUNT(*) AS cnt FROM users')?.cnt || 0;
        const totalMeds = dbGet('SELECT COUNT(*) AS cnt FROM medications')?.cnt || 0;
        const todayLogs = dbGet('SELECT COUNT(*) AS cnt FROM medication_logs WHERE log_date = ?', [new Date().toISOString().split('T')[0]])?.cnt || 0;
        const todayTaken = dbGet('SELECT COUNT(*) AS cnt FROM medication_logs WHERE log_date = ? AND taken_status = 1', [new Date().toISOString().split('T')[0]])?.cnt || 0;
        const healthRecords = dbGet('SELECT COUNT(*) AS cnt FROM health_records')?.cnt || 0;
        res.json({
            totalUsers, totalMeds, todayLogs, todayTaken,
            todayAdherence: todayLogs > 0 ? Math.round(todayTaken / todayLogs * 100) : 0,
            healthRecords
        });
    });

    app.get('/api/admin/overview', auth, adminAuth, (req, res) => {
        const today = new Date().toISOString().split('T')[0];
        const dayStart = `${today} 00:00:00`;
        const d7 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const d30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const totalUsers = dbGet("SELECT COUNT(*) AS c FROM users WHERE COALESCE(role,'user')!='admin'")?.c || 0;
        const newToday = dbGet("SELECT COUNT(*) AS c FROM users WHERE COALESCE(role,'user')!='admin' AND created_at>=?", [dayStart])?.c || 0;
        const new7 = dbGet("SELECT COUNT(*) AS c FROM users WHERE COALESCE(role,'user')!='admin' AND date(created_at)>=?", [d7])?.c || 0;
        const emailVerified = dbGet("SELECT COUNT(*) AS c FROM users WHERE COALESCE(role,'user')!='admin' AND email_verified=1")?.c || 0;
        const deviceAccounts = dbGet("SELECT COUNT(*) AS c FROM users WHERE COALESCE(role,'user')!='admin' AND account_source='device'")?.c || 0;
        const active7 = dbGet('SELECT COUNT(DISTINCT user_id) AS c FROM medication_logs WHERE log_date>=?', [d7])?.c || 0;
        const active30 = dbGet('SELECT COUNT(DISTINCT user_id) AS c FROM medication_logs WHERE log_date>=?', [d30])?.c || 0;
        const medUsers = dbGet("SELECT COUNT(DISTINCT user_id) AS c FROM medications WHERE COALESCE(is_active,1)=1")?.c || 0;
        const proUsers = dbGet("SELECT COUNT(*) AS c FROM subscriptions WHERE is_pro=1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)")?.c || 0;
        const pushUsers = dbGet('SELECT COUNT(DISTINCT user_id) AS c FROM push_tokens WHERE enabled=1')?.c || 0;
        const unreadNotifications = dbGet("SELECT COUNT(*) AS c FROM notifications WHERE COALESCE(status,'unread')='unread'")?.c || 0;
        const todayLogs = dbGet('SELECT COUNT(*) AS c FROM medication_logs WHERE log_date=?', [today])?.c || 0;
        const todayTaken = dbGet('SELECT COUNT(*) AS c FROM medication_logs WHERE log_date=? AND taken_status=1', [today])?.c || 0;
        const lowStock = dbGet(`
            SELECT COUNT(*) AS c
            FROM medications
            WHERE COALESCE(is_active,1)=1
              AND remaining IS NOT NULL
              AND remaining <= COALESCE(refill_threshold,7)
        `)?.c || 0;
        const expiredMeds = dbGet(`
            SELECT COUNT(*) AS c
            FROM medications
            WHERE COALESCE(is_active,1)=1
              AND end_date IS NOT NULL
              AND end_date < ?
        `, [today])?.c || 0;
        const daily = [];
        for (let i = 13; i >= 0; i--) {
            const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
            const signups = dbGet("SELECT COUNT(*) AS c FROM users WHERE COALESCE(role,'user')!='admin' AND date(created_at)=?", [date])?.c || 0;
            const active = dbGet('SELECT COUNT(DISTINCT user_id) AS c FROM medication_logs WHERE log_date=?', [date])?.c || 0;
            const total = dbGet('SELECT COUNT(*) AS c FROM medication_logs WHERE log_date=?', [date])?.c || 0;
            const taken = dbGet('SELECT COUNT(*) AS c FROM medication_logs WHERE log_date=? AND taken_status=1', [date])?.c || 0;
            daily.push({ date, signups, activeUsers: active, adherenceRate: total ? Math.round(taken / total * 100) : 0 });
        }
        const users = dbAll(`
            SELECT u.id, u.name, u.email, u.phone, u.account_code, u.account_source, u.email_verified, u.created_at,
                   COALESCE(s.is_pro,0) AS is_pro,
                   (SELECT COUNT(*) FROM medications m WHERE m.user_id=u.id AND COALESCE(m.is_active,1)=1) AS active_meds,
                   (SELECT COUNT(*) FROM push_tokens pt WHERE pt.user_id=u.id AND pt.enabled=1) AS push_devices,
                   (SELECT MAX(last_seen_at) FROM push_tokens pt WHERE pt.user_id=u.id) AS last_push_seen,
                   (SELECT MAX(log_date) FROM medication_logs ml WHERE ml.user_id=u.id) AS last_log_date,
                   (SELECT COUNT(*) FROM notifications n WHERE n.user_id=u.id AND COALESCE(n.status,'unread')='unread') AS unread_count
            FROM users u
            LEFT JOIN subscriptions s ON s.user_id=u.id
            WHERE COALESCE(u.role,'user')!='admin'
            ORDER BY u.created_at DESC
            LIMIT 300
        `).map(u => {
            const adherence = summarizeAdherence(u.id, 7);
            let risk = 'normal';
            const reasons = [];
            if (u.active_meds > 0 && adherence.total === 0) { risk = 'watch'; reasons.push('近7天無服藥打卡'); }
            if (adherence.total > 0 && adherence.rate < 50) { risk = 'high'; reasons.push(`遵從率 ${adherence.rate}%`); }
            else if (adherence.total > 0 && adherence.rate < 75 && risk !== 'high') { risk = 'watch'; reasons.push(`遵從率 ${adherence.rate}%`); }
            if (u.active_meds > 0 && Number(u.push_devices || 0) === 0) { if (risk === 'normal') risk = 'watch'; reasons.push('未註冊推播裝置'); }
            if (Number(u.unread_count || 0) >= 5) { if (risk === 'normal') risk = 'watch'; reasons.push(`未讀通知 ${u.unread_count}`); }
            return { ...u, email: publicEmail(u), adherence, risk, riskReasons: reasons };
        });
        res.json({
            summary: {
                totalUsers,
                newToday,
                new7,
                emailVerified,
                deviceAccounts,
                active7,
                active30,
                medUsers,
                proUsers,
                pushUsers,
                unreadNotifications,
                lowStock,
                expiredMeds,
                todayAdherence: todayLogs > 0 ? Math.round(todayTaken / todayLogs * 100) : 0
            },
            daily,
            attention: users.filter(u => u.risk !== 'normal').slice(0, 30),
            latestUsers: users.slice(0, 20)
        });
    });

    app.get('/api/admin/push/status', auth, adminAuth, (req, res) => {
        const counts = dbAll(`
            SELECT platform,
                   COUNT(*) AS total,
                   SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) AS enabled
            FROM push_tokens
            GROUP BY platform
            ORDER BY platform
        `);
        const recent = dbAll(`
            SELECT pt.id, pt.user_id, u.name, u.email, pt.platform, pt.app_version, pt.enabled,
                   pt.last_seen_at, pt.created_at, substr(pt.token, -10) AS token_tail
            FROM push_tokens pt
            LEFT JOIN users u ON u.id = pt.user_id
            ORDER BY pt.last_seen_at DESC
            LIMIT 30
        `).map(row => ({ ...row, email: publicEmail(row) }));
        const total = dbGet('SELECT COUNT(*) AS c FROM push_tokens')?.c || 0;
        const enabled = dbGet('SELECT COUNT(*) AS c FROM push_tokens WHERE enabled=1')?.c || 0;
        res.json({
            config: getPushConfigStatus(),
            totals: { total, enabled },
            counts,
            recent
        });
    });

    app.get('/api/admin/push/segment-preview', auth, adminAuth, (req, res) => {
        const segment = String(req.query.segment || '');
        const users = loadAdminSegmentUsers(segment, 500);
        res.json({
            segment,
            count: users.length,
            users: users.slice(0, 50)
        });
    });

    app.post('/api/admin/push/test', auth, adminAuth, async (req, res) => {
        const requestedIds = Array.isArray(req.body.user_ids)
            ? req.body.user_ids
            : (req.body.user_id ? [req.body.user_id] : []);
        const segmentUsers = req.body.segment ? loadAdminSegmentUsers(req.body.segment, req.body.segment_limit || 200) : [];
        const userIds = [...new Set([
            ...requestedIds.map(id => parseInt(id, 10)).filter(Boolean),
            ...segmentUsers.map(u => Number(u.id || 0)).filter(Boolean)
        ])].slice(0, 500);
        if (userIds.length === 0) return res.status(400).json({ error: '請至少選擇一位用戶' });
        const title = String(req.body.title || '藥護家後台測試通知').trim().slice(0, 120);
        const body = String(req.body.body || '這是一則由管理後台發出的原生推播測試。').trim().slice(0, 240);
        const placeholders = userIds.map(() => '?').join(',');
        const users = dbAll(`SELECT id,name FROM users WHERE id IN (${placeholders})`, userIds);
        if (users.length === 0) return res.status(404).json({ error: '找不到可發送的用戶' });
        const results = [];
        let nativeSent = 0;
        let nativeSkipped = 0;
        let noTokenUsers = 0;
        for (const user of users) {
            createUserNotification(user.id, {
                title,
                body,
                data: { action_url: '#notifications' }
            }, 'admin_push_test');
            const result = await sendPushToUser(user.id, {
                title,
                body,
                data: { type: 'admin_push_test', action_url: '/#home' }
            });
            nativeSent += Number(result.sent || 0);
            if (result.skipped === 'no_tokens') noTokenUsers += 1;
            else nativeSkipped += Number(result.skipped || 0);
            results.push({ user_id: user.id, name: user.name, result });
        }
        saveDB();
        const missingCount = userIds.length - users.length;
        const summary = [
            `已建立站內通知 ${users.length} 位`,
            nativeSent > 0 ? `原生推播送出 ${nativeSent} 台裝置` : '',
            noTokenUsers > 0 ? `${noTokenUsers} 位尚未註冊原生推播 token` : '',
            nativeSkipped > 0 ? `略過 ${nativeSkipped} 台裝置` : '',
            missingCount > 0 ? `${missingCount} 位用戶不存在` : ''
        ].filter(Boolean).join('；');
        res.json({
            message: summary,
            result: {
                sent: nativeSent,
                skipped: nativeSkipped,
                no_token_users: noTokenUsers,
                user_count: users.length,
                requested_count: userIds.length,
                segment: req.body.segment || null
            },
            results,
            config: getPushConfigStatus()
        });
        logAdminAction(req, 'push.send', {
            targetType: 'notification',
            summary: `${summary}；標題：${title}`,
            after: { user_ids: userIds, segment: req.body.segment || null, title, body }
        });
        saveDB();
    });

    // 管理員查看所有用戶
    app.get('/api/admin/users', auth, adminAuth, (req, res) => {
        const q = String(req.query.q || '').trim().toLowerCase();
        const status = String(req.query.status || 'all');
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 50));
        const offset = (page - 1) * limit;
        const where = [];
        const params = [];
        if (q) {
            where.push('(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(COALESCE(u.phone,\'\')) LIKE ? OR LOWER(COALESCE(u.account_code,\'\')) LIKE ?)');
            params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
        }
        if (status === 'users') where.push("COALESCE(u.role,'user')!='admin'");
        if (status === 'admins') where.push("COALESCE(u.role,'user')='admin'");
        if (status === 'pro') where.push('COALESCE(s.is_pro,0)=1 AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)');
        if (status === 'no_push') where.push("COALESCE(u.role,'user')!='admin' AND NOT EXISTS (SELECT 1 FROM push_tokens pt WHERE pt.user_id=u.id AND pt.enabled=1)");
        if (status === 'unverified') where.push("COALESCE(u.role,'user')!='admin' AND COALESCE(u.email_verified,0)=0");
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const total = dbGet(`SELECT COUNT(*) AS c FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id ${whereSql}`, params)?.c || 0;
        const users = dbAll(`
            SELECT u.id, u.name, u.email, u.phone, u.age, u.role, u.account_code, u.account_source,
                   u.email_verified, u.last_device_login_at, u.created_at,
                   COALESCE(s.is_pro,0) AS is_pro, s.plan, s.product_identifier, s.expires_at,
                   (SELECT COUNT(*) FROM medications WHERE user_id = u.id AND COALESCE(is_active,1)=1) AS med_count,
                   (SELECT COUNT(*) FROM medication_logs WHERE user_id = u.id) AS log_count,
                   (SELECT COUNT(*) FROM push_tokens WHERE user_id = u.id AND enabled=1) AS push_count,
                   (SELECT COUNT(*) FROM notifications WHERE user_id = u.id AND COALESCE(status,'unread')='unread') AS unread_notifications,
                   (SELECT MAX(log_date) FROM medication_logs WHERE user_id = u.id) AS last_log_date
            FROM users u
            LEFT JOIN subscriptions s ON s.user_id=u.id
            ${whereSql}
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        for (const u of users) {
            const todayLogs = dbGet('SELECT COUNT(*) AS cnt FROM medication_logs WHERE user_id = ? AND log_date = ?', [u.id, new Date().toISOString().split('T')[0]])?.cnt || 0;
            const todayTaken = dbGet('SELECT COUNT(*) AS cnt FROM medication_logs WHERE user_id = ? AND log_date = ? AND taken_status = 1', [u.id, new Date().toISOString().split('T')[0]])?.cnt || 0;
            u.today_adherence = todayLogs > 0 ? Math.round(todayTaken / todayLogs * 100) : '-';
            u.week_adherence = summarizeAdherence(u.id, 7);
            u.email = publicEmail(u);
        }
        res.json({ users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    });

    // 管理員刪除用戶
    app.delete('/api/admin/users/:id', auth, adminAuth, (req, res) => {
        const uid = parseInt(req.params.id);
        if (uid === req.user.id) return res.status(400).json({ error: '不能刪除自己' });
        const user = dbGet('SELECT id, name, email, account_code FROM users WHERE id=?', [uid]);
        deleteUserData(uid);
        logAdminAction(req, 'user.delete', {
            targetType: 'user',
            targetId: uid,
            summary: `刪除用戶 ${user?.name || user?.account_code || uid}`,
            before: user
        });
        saveDB();
        res.json({ message: '用戶及相關資料已刪除' });
    });

    // 管理員查看特定用戶詳細資料
    app.get('/api/admin/users/:id/detail', auth, adminAuth, (req, res) => {
        const uid = parseInt(req.params.id);
        const user = dbGet(`
            SELECT u.id, u.name, u.email, u.phone, u.age, u.role, u.account_code, u.account_source,
                   u.email_verified, u.email_verified_at, u.last_device_login_at, u.created_at,
                   COALESCE(s.is_pro,0) AS is_pro, s.plan, s.entitlement, s.product_identifier,
                   s.store, s.expires_at, s.source, s.updated_at AS subscription_updated_at
            FROM users u
            LEFT JOIN subscriptions s ON s.user_id=u.id
            WHERE u.id=?
        `, [uid]);
        if (!user) return res.status(404).json({ error: '用戶不存在' });
        const medications = dbAll('SELECT * FROM medications WHERE user_id=? ORDER BY created_at DESC', [uid]);
        const healthRecords = dbAll('SELECT * FROM health_records WHERE user_id=? ORDER BY record_date DESC LIMIT 30', [uid]);
        const today = new Date().toISOString().split('T')[0];
        const todayLogs = dbAll(`
            SELECT ml.*, m.drug_name 
            FROM medication_logs ml 
            JOIN medications m ON ml.medication_id = m.id 
            WHERE ml.user_id=? AND ml.log_date=? 
            ORDER BY ml.remind_time`, [uid, today]);
        const familyMembers = dbAll(`
            SELECT fm.*, u.name AS related_name, u.email AS related_email
            FROM family_members fm 
            JOIN users u ON fm.related_user_id = u.id 
            WHERE fm.user_id=?`, [uid]);
        const familyWatchers = dbAll(`
            SELECT fm.*, u.name AS owner_name, u.email AS owner_email
            FROM family_members fm
            JOIN users u ON fm.user_id = u.id
            WHERE fm.related_user_id=?`, [uid]).map(row => ({ ...row, owner_email: publicEmail({ email: row.owner_email }) }));
        const pushTokens = dbAll(`
            SELECT id, platform, device_id, app_version, enabled, last_seen_at, created_at, substr(token, -10) AS token_tail
            FROM push_tokens
            WHERE user_id=?
            ORDER BY last_seen_at DESC
            LIMIT 20`, [uid]);
        const notifications = dbAll(`
            SELECT id, type, title, message, status, is_read, created_at
            FROM notifications
            WHERE user_id=?
            ORDER BY created_at DESC
            LIMIT 20`, [uid]);
        const adherence7 = summarizeAdherence(uid, 7);
        const adherence30 = summarizeAdherence(uid, 30);
        res.json({
            user: { ...user, email: publicEmail(user) },
            medications,
            healthRecords,
            todayLogs,
            familyMembers,
            familyWatchers,
            pushTokens,
            notifications,
            adherence: { sevenDays: adherence7, thirtyDays: adherence30 }
        });
    });

    app.put('/api/admin/users/:id/subscription', auth, adminAuth, (req, res) => {
        const uid = parseInt(req.params.id, 10);
        const user = dbGet('SELECT id, name, email, account_code FROM users WHERE id=?', [uid]);
        if (!user) return res.status(404).json({ error: '用戶不存在' });
        const before = dbGet('SELECT * FROM subscriptions WHERE user_id=?', [uid]);
        const isPro = req.body?.is_pro === true || req.body?.is_pro === 1 || req.body?.is_pro === '1';
        const expiresAt = req.body?.expires_at ? String(req.body.expires_at).trim() : null;
        if (expiresAt && !/^\d{4}-\d{2}-\d{2}/.test(expiresAt)) return res.status(400).json({ error: '到期日格式不正確' });
        const reason = String(req.body?.reason || '').trim().slice(0, 240);
        const plan = isPro ? String(req.body?.plan || 'pro_manual').trim().slice(0, 80) : 'free';
        const product = isPro ? String(req.body?.product_identifier || 'manual_admin_grant').trim().slice(0, 120) : null;
        dbRun(
            `INSERT INTO subscriptions (user_id, plan, entitlement, product_identifier, store, is_pro, expires_at, source, raw_customer_info, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
             ON CONFLICT(user_id) DO UPDATE SET
                plan=excluded.plan,
                entitlement=excluded.entitlement,
                product_identifier=excluded.product_identifier,
                store=excluded.store,
                is_pro=excluded.is_pro,
                expires_at=excluded.expires_at,
                source=excluded.source,
                raw_customer_info=excluded.raw_customer_info,
                updated_at=CURRENT_TIMESTAMP`,
            [
                uid,
                plan,
                SUBSCRIPTION_ENTITLEMENT_ID,
                product,
                isPro ? 'manual' : null,
                isPro ? 1 : 0,
                isPro ? (expiresAt || null) : new Date().toISOString(),
                'admin_manual',
                JSON.stringify({ reason, admin_user_id: req.user.id, updated_at: new Date().toISOString() }).slice(0, 60000)
            ]
        );
        const after = dbGet('SELECT * FROM subscriptions WHERE user_id=?', [uid]);
        logAdminAction(req, isPro ? 'subscription.grant' : 'subscription.revoke', {
            targetType: 'user',
            targetId: uid,
            summary: `${isPro ? '開通' : '取消'} ${user.name || user.account_code || uid} Pro 權限${reason ? '：' + reason : ''}`,
            before,
            after
        });
        saveDB();
        res.json({
            message: isPro ? 'Pro 權限已開通' : 'Pro 權限已取消',
            subscription: after
        });
    });

    app.get('/api/admin/audit-logs', auth, adminAuth, (req, res) => {
        const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 50));
        const rows = dbAll(`
            SELECT l.id, l.admin_user_id, u.name AS admin_name, l.action, l.target_type, l.target_id,
                   l.summary, l.ip_address, l.created_at
            FROM admin_audit_logs l
            LEFT JOIN users u ON u.id = l.admin_user_id
            ORDER BY l.created_at DESC
            LIMIT ?`, [limit]);
        res.json({ logs: rows });
    });

    // ====== 使用者帳號管理 ======
    // 修改密碼
    app.put('/api/user/password', auth, (req, res) => {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) return res.status(400).json({ error: '請提供舊密碼和新密碼' });
        if (newPassword.length < 6) return res.status(400).json({ error: '新密碼至少6位' });
        const u = dbGet('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
        if (!u || !verifyPwd(oldPassword, u.password_hash)) return res.status(401).json({ error: '舊密碼錯誤' });
        dbRun('UPDATE users SET password_hash=? WHERE id=?', [hashPwd(newPassword), req.user.id]);
        saveDB();
        res.json({ message: '密碼修改成功' });
    });

    // 刪除自己的帳號
    app.delete('/api/user/account', auth, (req, res) => {
        const uid = req.user.id;
        deleteUserData(uid);
        saveDB();
        res.json({ message: '帳號已永久刪除' });
    });

    // 匯出個人資料 CSV
    app.get('/api/user/export', auth, (req, res) => {
        const uid = req.user.id;
        const user = dbGet('SELECT name, email, phone, age FROM users WHERE id=?', [uid]);
        const meds = dbAll('SELECT drug_name, dosage, usage_notes, remind_time, created_at FROM medications WHERE user_id=?', [uid]);
        const logs = dbAll(`
            SELECT m.drug_name, ml.remind_time, ml.taken_status, ml.log_date
            FROM medication_logs ml JOIN medications m ON ml.medication_id=m.id
            WHERE ml.user_id=? ORDER BY ml.log_date DESC LIMIT 365`, [uid]);
        const health = dbAll('SELECT record_date, blood_pressure_sys, blood_pressure_dia, blood_sugar, weight FROM health_records WHERE user_id=? ORDER BY record_date DESC LIMIT 90', [uid]);

        let csv = '\uFEFF'; // BOM for Excel
        csv += '--- 個人資料 ---\n姓名,Email,電話,年齡\n';
        if (user) csv += `${user.name},${user.email},${user.phone||''},${user.age||''}\n\n`;
        csv += '--- 用藥列表 ---\n藥名,劑量,服用須知,提醒時間,建立日期\n';
        meds.forEach(m => { csv += `"${m.drug_name}","${m.dosage}","${m.usage_notes||''}","${(m.remind_time||'').replace(/[\[\]"]/g,'')}","${m.created_at||''}"\n`; });
        csv += '\n--- 服藥紀錄(近一年) ---\n藥名,提醒時間,狀態,日期\n';
        logs.forEach(l => { csv += `"${l.drug_name}",${l.remind_time},${l.taken_status?'已吃':'未吃'},${l.log_date}\n`; });
        csv += '\n--- 健康數據(近90天) ---\n日期,收縮壓,舒張壓,血糖,體重\n';
        health.forEach(h => { csv += `${h.record_date},${h.blood_pressure_sys||''},${h.blood_pressure_dia||''},${h.blood_sugar||''},${h.weight||''}\n`; });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=medremind_export_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    });

    // 用藥日曆（指定月份）
    app.get('/api/medications/calendar', auth, (req, res) => {
        const { month } = req.query;
        const target = month ? new Date(month + '-01') : new Date();
        const year = target.getFullYear();
        const mon = target.getMonth() + 1;
        const startDate = `${year}-${String(mon).padStart(2,'0')}-01`;
        const endDate = new Date(year, mon, 0).toISOString().split('T')[0];

        const logs = dbAll(`
            SELECT ml.log_date, ml.taken_status, ml.remind_time, m.drug_name
            FROM medication_logs ml JOIN medications m ON ml.medication_id=m.id
            WHERE ml.user_id=? AND ml.log_date >= ? AND ml.log_date <= ?
            ORDER BY ml.log_date, ml.remind_time`, [req.user.id, startDate, endDate]);

        // 按日期分組
        const calendar = {};
        logs.forEach(l => {
            if (!calendar[l.log_date]) calendar[l.log_date] = { taken: 0, total: 0, details: [] };
            calendar[l.log_date].total++;
            if (l.taken_status) calendar[l.log_date].taken++;
            calendar[l.log_date].details.push({ drug: l.drug_name, time: l.remind_time, taken: !!l.taken_status });
        });
        res.json({ year, month: mon, calendar });
    });

    // 健康數據統計
    app.get('/api/health/stats', auth, (req, res) => {
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

        const bp = dbAll(`SELECT blood_pressure_sys, blood_pressure_dia, record_date FROM health_records WHERE user_id=? AND record_date >= ? AND blood_pressure_sys IS NOT NULL ORDER BY record_date`, [req.user.id, startDate]);
        const sugar = dbAll(`SELECT blood_sugar, record_date FROM health_records WHERE user_id=? AND record_date >= ? AND blood_sugar IS NOT NULL ORDER BY record_date`, [req.user.id, startDate]);
        const weight = dbAll(`SELECT weight, record_date FROM health_records WHERE user_id=? AND record_date >= ? AND weight IS NOT NULL ORDER BY record_date`, [req.user.id, startDate]);

        const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10 : null;
        const max = arr => arr.length ? Math.max(...arr) : null;
        const min = arr => arr.length ? Math.min(...arr) : null;

        const bpSys = bp.map(r=>r.blood_pressure_sys);
        const bpDia = bp.map(r=>r.blood_pressure_dia);
        const sugarVals = sugar.map(r=>r.blood_sugar);
        const weightVals = weight.map(r=>r.weight);

        res.json({
            bp: { count: bp.length, avgSystolic: avg(bpSys), avgDiastolic: avg(bpDia), maxSystolic: max(bpSys), minSystolic: min(bpSys), trend: bp.map(r=>({ date: r.record_date, sys: r.blood_pressure_sys, dia: r.blood_pressure_dia })) },
            sugar: { count: sugar.length, avg: avg(sugarVals), max: max(sugarVals), min: min(sugarVals), trend: sugar.map(r=>({ date: r.record_date, value: r.blood_sugar })) },
            weight: { count: weight.length, avg: avg(weightVals), max: max(weightVals), min: min(weightVals), trend: weight.map(r=>({ date: r.record_date, value: r.weight })) },
            days
        });
    });

    // ====== 管理員增強 API ======
    // 管理員重設用戶密碼
    app.put('/api/admin/users/:id/reset-password', auth, adminAuth, (req, res) => {
        const uid = parseInt(req.params.id);
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: '新密碼至少6位' });
        const user = dbGet('SELECT id, name FROM users WHERE id=?', [uid]);
        if (!user) return res.status(404).json({ error: '用戶不存在' });
        dbRun('UPDATE users SET password_hash=? WHERE id=?', [hashPwd(newPassword), uid]);
        logAdminAction(req, 'user.reset_password', {
            targetType: 'user',
            targetId: uid,
            summary: `重設 ${user.name || uid} 密碼`
        });
        saveDB();
        res.json({ message: `${user.name} 的密碼已重設`, newPassword });
    });

    // 管理員匯出用戶資料 CSV
    app.get('/api/admin/users/:id/export', auth, adminAuth, (req, res) => {
        const uid = parseInt(req.params.id);
        const user = dbGet('SELECT name, email, phone, age FROM users WHERE id=?', [uid]);
        if (!user) return res.status(404).json({ error: '用戶不存在' });
        const meds = dbAll('SELECT drug_name, dosage, usage_notes, remind_time FROM medications WHERE user_id=?', [uid]);
        const logs = dbAll(`SELECT m.drug_name, ml.remind_time, ml.taken_status, ml.log_date FROM medication_logs ml JOIN medications m ON ml.medication_id=m.id WHERE ml.user_id=? ORDER BY ml.log_date DESC LIMIT 365`, [uid]);
        const health = dbAll('SELECT record_date, blood_pressure_sys, blood_pressure_dia, blood_sugar, weight FROM health_records WHERE user_id=? ORDER BY record_date DESC LIMIT 90', [uid]);

        let csv = '\uFEFF';
        csv += `姓名,Email,電話,年齡\n${user.name},${user.email},${user.phone||''},${user.age||''}\n\n`;
        csv += '藥名,劑量,服用須知,提醒時間\n';
        meds.forEach(m => { csv += `"${m.drug_name}","${m.dosage}","${m.usage_notes||''}","${(m.remind_time||'').replace(/[\[\]"]/g,'')}"\n`; });
        csv += '\n藥名,提醒時間,狀態,日期\n';
        logs.forEach(l => { csv += `"${l.drug_name}",${l.remind_time},${l.taken_status?'已吃':'未吃'},${l.log_date}\n`; });
        csv += '\n日期,收縮壓,舒張壓,血糖,體重\n';
        health.forEach(h => { csv += `${h.record_date},${h.blood_pressure_sys||''},${h.blood_pressure_dia||''},${h.blood_sugar||''},${h.weight||''}\n`; });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${user.name}_export_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    });

    // ====== 忘記密碼 ======
    async function requestPasswordReset(req, res) {
        const email = normalizeEmail(req.body.email);
        if (!email) return res.status(400).json({ error: '請輸入 Email' });
        const generic = { message: '如果此 Email 已註冊，系統會寄出密碼重設信' };
        const u = dbGet('SELECT id,name,email,email_verified FROM users WHERE email=?', [email]);
        if (u) {
            try {
                if (u.email_verified) await sendPasswordResetEmail(u);
                else await sendVerificationEmail(u);
            } catch (e) {
                console.error('Password reset email failed:', e);
                return res.status(500).json({ error: '信件寄送失敗，請稍後再試' });
            }
        }
        res.json(generic);
    }

    app.post('/api/password-reset/request', requestPasswordReset);
    app.post('/api/forgot-password', requestPasswordReset);

    app.get('/reset-password', (req, res) => {
        const token = escapeHTML(req.query.token || '');
        res.send(`<!doctype html>
<html lang="zh-Hant">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>重設藥護家密碼</title>
    <style>
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:24px;color:#1f2937}
        .card{max-width:420px;margin:48px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
        h1{font-size:24px;margin:0 0 16px;color:#0f766e}
        label{display:block;margin:12px 0 6px;font-weight:600}
        input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:16px}
        button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:8px;background:#0f766e;color:#fff;font-size:16px;font-weight:700}
        .msg{margin-top:12px;line-height:1.6}
    </style>
</head>
<body>
    <div class="card">
        <h1>重設密碼</h1>
        <p>請輸入新的藥護家登入密碼。</p>
        <form id="reset-form">
            <input type="hidden" id="token" value="${token}">
            <label for="password">新密碼</label>
            <input type="password" id="password" minlength="6" required autocomplete="new-password">
            <label for="password2">再次輸入新密碼</label>
            <input type="password" id="password2" minlength="6" required autocomplete="new-password">
            <button type="submit">更新密碼</button>
        </form>
        <div class="msg" id="msg"></div>
    </div>
    <script>
        document.getElementById('reset-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const msg = document.getElementById('msg');
            const newPassword = document.getElementById('password').value;
            const password2 = document.getElementById('password2').value;
            if (newPassword.length < 6) { msg.textContent = '新密碼至少6位'; return; }
            if (newPassword !== password2) { msg.textContent = '兩次密碼不一致'; return; }
            const response = await fetch('/api/password-reset/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: document.getElementById('token').value, newPassword })
            });
            const data = await response.json().catch(() => ({}));
            msg.textContent = data.message || data.error || '更新失敗';
            if (response.ok) setTimeout(() => { location.href = '/'; }, 1500);
        });
    </script>
</body>
</html>`);
    });

    app.post('/api/password-reset/confirm', (req, res) => {
        const token = String(req.body.token || '');
        const newPassword = String(req.body.newPassword || '');
        if (!token) return res.status(400).json({ error: '重設連結無效' });
        if (newPassword.length < 6) return res.status(400).json({ error: '新密碼至少6位' });
        const tokenHash = hashToken(token);
        const u = dbGet('SELECT id FROM users WHERE password_reset_token_hash=? AND password_reset_expires_at > ?', [tokenHash, new Date().toISOString()]);
        if (!u) return res.status(400).json({ error: '重設連結無效或已過期，請重新申請' });
        dbRun('UPDATE users SET password_hash=?, password_reset_token_hash=NULL, password_reset_expires_at=NULL WHERE id=?', [hashPwd(newPassword), u.id]);
        saveDB();
        res.json({ message: '密碼已更新，請重新登入' });
    });

    // ====== 就診報告 ======
    app.get('/api/report', auth, (req, res) => {
        const uid = req.user.id;
        const user = dbGet('SELECT name, email, phone, age FROM users WHERE id=?', [uid]);
        const meds = dbAll('SELECT drug_name, dosage, usage_notes, remind_time FROM medications WHERE user_id=?', [uid]);
        const today = new Date().toISOString().split('T')[0];
        const start30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const logs = dbAll(`
            SELECT ml.log_date, ml.taken_status, ml.remind_time, m.drug_name
            FROM medication_logs ml JOIN medications m ON ml.medication_id=m.id
            WHERE ml.user_id=? AND ml.log_date >= ? AND ml.log_date <= ?
            ORDER BY ml.log_date DESC, ml.remind_time`, [uid, start30, today]);
        const adherence = {};
        logs.forEach(l => {
            if (!adherence[l.log_date]) adherence[l.log_date] = { taken: 0, total: 0 };
            adherence[l.log_date].total++;
            if (l.taken_status) adherence[l.log_date].taken++;
        });
        const days = Object.keys(adherence).length;
        const totalTaken = Object.values(adherence).reduce((s, d) => s + d.taken, 0);
        const totalReminders = Object.values(adherence).reduce((s, d) => s + d.total, 0);
        const health = dbAll('SELECT * FROM health_records WHERE user_id=? AND record_date >= ? ORDER BY record_date DESC', [uid, start30]);
        const bp = health.filter(h => h.blood_pressure_sys).map(h => ({ date: h.record_date, sys: h.blood_pressure_sys, dia: h.blood_pressure_dia }));
        const sugar = health.filter(h => h.blood_sugar).map(h => ({ date: h.record_date, value: h.blood_sugar }));
        const weight = health.filter(h => h.weight).map(h => ({ date: h.record_date, value: h.weight }));
        res.json({
            user, medications: meds,
            adherence: { days, totalTaken, totalReminders, rate: totalReminders > 0 ? Math.round(totalTaken / totalReminders * 100) : 0, daily: adherence },
            health: { bp, sugar, weight },
            generatedAt: new Date().toISOString()
        });
    });

    // ====== 新手導覽狀態 ======
    app.get('/api/user/onboarding', auth, (req, res) => {
        const s = dbGet('SELECT onboarding_completed FROM user_settings WHERE user_id=?', [req.user.id]);
        res.json({ completed: s ? !!s.onboarding_completed : false });
    });

    app.put('/api/user/onboarding', auth, (req, res) => {
        dbRun('INSERT INTO user_settings (user_id, onboarding_completed) VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET onboarding_completed=1', [req.user.id]);
        saveDB();
        res.json({ message: '已標記為完成' });
    });

    // ====== 用藥日記 ======
    app.get('/api/medications/diary', auth, (req, res) => {
        const medId = req.query.medication_id;
        let sql = `SELECT md.*, m.drug_name FROM medication_diary md JOIN medications m ON md.medication_id=m.id WHERE md.user_id=?`;
        const params = [req.user.id];
        if (medId) { sql += ' AND md.medication_id=?'; params.push(medId); }
        sql += ' ORDER BY md.created_at DESC LIMIT 50';
        res.json({ entries: dbAll(sql, params) });
    });

    app.post('/api/medications/diary', auth, (req, res) => {
        const { medication_id, mood, side_effects, notes } = req.body;
        if (!medication_id) return res.status(400).json({ error: '請指定藥品' });
        dbRun('INSERT INTO medication_diary (user_id, medication_id, mood, side_effects, notes) VALUES (?,?,?,?,?)',
            [req.user.id, medication_id, mood || null, side_effects || null, notes || null]);
        saveDB();
        res.json({ message: '日記已記錄' });
    });

    // ====== 回診提醒 ======
    app.get('/api/appointments', auth, (req, res) => {
        const appointments = dbAll('SELECT * FROM appointments WHERE user_id=? ORDER BY appointment_date ASC', [req.user.id]);
        res.json({ appointments });
    });

    app.post('/api/appointments', auth, (req, res) => {
        const { title, appointment_date, clinic_name, notes } = req.body;
        if (!title || !appointment_date) return res.status(400).json({ error: '請填寫標題和日期' });
        if (!isValidDateString(appointment_date)) return res.status(400).json({ error: '回診日期格式不正確' });
        dbRun('INSERT INTO appointments (user_id, title, appointment_date, clinic_name, notes) VALUES (?,?,?,?,?)',
            [req.user.id, String(title).trim().slice(0, 120), appointment_date, clinic_name ? String(clinic_name).trim().slice(0, 120) : null, notes ? String(notes).trim().slice(0, 500) : null]);
        saveDB();
        res.json({ message: '回診已設定' });
    });

    app.delete('/api/appointments/:id', auth, (req, res) => {
        dbRun('DELETE FROM appointments WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
        saveDB();
        res.json({ message: '已刪除' });
    });

    // ====== 用藥遵從趨勢 ======
    app.get('/api/medications/adherence-trend', auth, (req, res) => {
        const days = parseInt(req.query.days) || 14;
        const trends = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
            const total = dbGet('SELECT COUNT(*) AS cnt FROM medication_logs WHERE user_id=? AND log_date=?', [req.user.id, date])?.cnt || 0;
            const taken = dbGet('SELECT COUNT(*) AS cnt FROM medication_logs WHERE user_id=? AND log_date=? AND taken_status=1', [req.user.id, date])?.cnt || 0;
            trends.push({ date, total, taken, rate: total > 0 ? Math.round(taken / total * 100) : null });
        }
        res.json({ trends });
    });

    // ====== 管理員分析面板 ======
    app.get('/api/admin/analytics', auth, adminAuth, (req, res) => {
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const allUsers = dbAll('SELECT id, name FROM users WHERE role!="admin"');

        // 逐日活躍與遵從率
        const dailyStats = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
            const activeUsers = dbGet('SELECT COUNT(DISTINCT user_id) AS cnt FROM medication_logs WHERE log_date=?', [date])?.cnt || 0;
            const totalLogs = dbGet('SELECT COUNT(*) AS cnt FROM medication_logs WHERE log_date=?', [date])?.cnt || 0;
            const takenLogs = dbGet('SELECT COUNT(*) AS cnt FROM medication_logs WHERE log_date=? AND taken_status=1', [date])?.cnt || 0;
            dailyStats.push({ date, activeUsers, totalLogs, takenLogs, adherenceRate: totalLogs > 0 ? Math.round(takenLogs / totalLogs * 100) : 0 });
        }

        // 低遵從用戶（近7天 < 50%）
        const atRisk = [];
        for (const u of allUsers) {
            const logs = dbGet('SELECT COUNT(*) AS total, SUM(taken_status) AS taken FROM medication_logs WHERE user_id=? AND log_date >= ?', [u.id, weekAgo]);
            const rate = logs?.total > 0 ? Math.round((logs.taken || 0) / logs.total * 100) : 100;
            if (rate < 50 && logs?.total > 0) atRisk.push({ id: u.id, name: u.name, rate, total: logs.total });
        }

        res.json({
            totalUsers: allUsers.length,
            activeToday: dailyStats[dailyStats.length - 1]?.activeUsers || 0,
            dailyStats,
            atRisk
        });
    });

    // ====== 用藥歷史（軟刪除） ======
    app.get('/api/medications/history', auth, (req, res) => {
        const meds = dbAll('SELECT * FROM medications WHERE user_id=? AND is_active=0 ORDER BY end_date DESC', [req.user.id]);
        res.json({ medications: meds });
    });

    // ====== 用藥異動紀錄 ======
    app.get('/api/medications/change-history', auth, (req, res) => {
        const changes = dbAll('SELECT * FROM medication_changes WHERE user_id=? ORDER BY created_at DESC LIMIT 80', [req.user.id]);
        res.json({ changes });
    });

    // ====== 緊急聯絡卡 ======
    app.get('/api/emergency-card', auth, (req, res) => {
        const uid = req.user.id;
        const user = dbGet('SELECT name,email,phone,age FROM users WHERE id=?', [uid]);
        const meds = dbAll('SELECT drug_name,dosage,usage_notes,remind_time FROM medications WHERE user_id=? AND is_active=1 ORDER BY drug_name', [uid]);
        const contacts = dbAll('SELECT * FROM emergency_contacts WHERE user_id=? ORDER BY created_at DESC', [uid]);
        const latestHealth = dbGet('SELECT * FROM health_records WHERE user_id=? ORDER BY record_date DESC LIMIT 1', [uid]);
        const adherence = summarizeAdherence(uid, 7);
        res.json({ user, medications: meds, contacts, latestHealth, adherence, generatedAt: new Date().toISOString() });
    });

    app.post('/api/emergency-contacts', auth, (req, res) => {
        const { name, phone, relationship, notes } = req.body;
        if (!name) return res.status(400).json({ error: '請輸入聯絡人姓名' });
        dbRun('INSERT INTO emergency_contacts (user_id,name,phone,relationship,notes) VALUES (?,?,?,?,?)',
            [req.user.id, name, phone || null, relationship || null, notes || null]);
        saveDB();
        res.json({ message: '緊急聯絡人已新增' });
    });

    app.delete('/api/emergency-contacts/:id', auth, (req, res) => {
        dbRun('DELETE FROM emergency_contacts WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
        saveDB();
        res.json({ message: '已刪除' });
    });

    // ====== AI 風險提醒與家人摘要 ======
    app.get('/api/ai/risk-summary', auth, (req, res) => {
        const meds = dbAll('SELECT drug_name,dosage,usage_notes,remind_time FROM medications WHERE user_id=? AND is_active=1', [req.user.id]);
        const adherence = summarizeAdherence(req.user.id, 7);
        const risks = buildMedicationRisk(meds);
        res.json({
            risks,
            adherence,
            summary: adherence.missed > 0
                ? `近 ${adherence.days} 天有 ${adherence.missed} 次未完成打卡，用藥遵從率 ${adherence.rate}%。`
                : `近 ${adherence.days} 天打卡狀況穩定，用藥遵從率 ${adherence.rate}%。`,
            disclaimer: '此為系統根據紀錄產生的一般提醒，不是診斷，不能取代醫師或藥師建議。'
        });
    });

    app.get('/api/family/care-summary', auth, (req, res) => {
        const members = dbAll('SELECT fm.related_user_id, fm.relationship, u.name FROM family_members fm JOIN users u ON fm.related_user_id=u.id WHERE fm.user_id=?', [req.user.id]);
        const summaries = members.map(m => {
            const adherence = summarizeAdherence(m.related_user_id, 7);
            const lowStock = dbAll('SELECT drug_name, remaining, daily_amount, refill_threshold FROM medications WHERE user_id=? AND is_active=1 AND remaining IS NOT NULL', [m.related_user_id])
                .map(row => {
                    const daysLeft = Math.floor((row.remaining || 0) / (row.daily_amount || 1));
                    return { ...row, days_left: daysLeft };
                })
                .filter(row => row.days_left <= (row.refill_threshold || 7));
            const latestHealth = dbGet('SELECT record_date,blood_pressure_sys,blood_pressure_dia,blood_sugar,weight,mood,sleep_hours FROM health_records WHERE user_id=? ORDER BY record_date DESC LIMIT 1', [m.related_user_id]);
            return {
                ...m,
                adherence,
                lowStock,
                latestHealth,
                sentence: `${m.name} 近 7 天用藥遵從率 ${adherence.rate}%，${adherence.missed > 0 ? '有 ' + adherence.missed + ' 次未打卡' : '目前沒有未打卡紀錄'}${lowStock.length ? '，且有 ' + lowStock.length + ' 項藥品需要補藥' : ''}。`
            };
        });
        res.json({ summaries });
    });

    // ====== 月報 / 進階版狀態 ======
    app.get('/api/report/monthly', auth, (req, res) => {
        const uid = req.user.id;
        const days = 30;
        const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
        const user = dbGet('SELECT name,email,phone,age FROM users WHERE id=?', [uid]);
        const adherence = summarizeAdherence(uid, days);
        const health = dbAll('SELECT * FROM health_records WHERE user_id=? AND record_date>=? ORDER BY record_date DESC', [uid, start]);
        const changes = dbAll('SELECT drug_name,change_type,created_at FROM medication_changes WHERE user_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 20', [uid, start]);
        const moods = dbAll('SELECT log_date,mood FROM mood_logs WHERE user_id=? AND log_date>=? ORDER BY log_date DESC', [uid, start]);
        const lowStock = dbAll('SELECT drug_name,remaining,daily_amount,refill_threshold FROM medications WHERE user_id=? AND is_active=1 AND remaining IS NOT NULL', [uid])
            .map(row => ({ ...row, days_left: Math.floor((row.remaining || 0) / (row.daily_amount || 1)) }))
            .filter(row => row.days_left <= (row.refill_threshold || 7));
        res.json({ user, period: { start, end: new Date().toISOString().split('T')[0], days }, adherence, health, changes, moods, lowStock, generatedAt: new Date().toISOString() });
    });

    app.get('/api/subscription/status', auth, (req, res) => {
        const sub = dbGet('SELECT * FROM subscriptions WHERE user_id=?', [req.user.id]);
        const active = isSubscriptionActive(sub);
        const catalog = subscriptionCatalog();
        res.json({
            plan: active ? (sub.plan || 'pro') : 'free',
            active,
            entitlement: SUBSCRIPTION_ENTITLEMENT_ID,
            product_identifier: sub?.product_identifier || null,
            expires_at: sub?.expires_at || null,
            source: sub?.source || null,
            tiers: {
                free: ['基本用藥提醒', '基本健康紀錄', '每日 1 次免費 AI 掃描', '看廣告兌換 AI 掃描'],
                premium: catalog.features
            },
            premium_locked: catalog.features,
            products: {
                monthly: catalog.monthly,
                yearly: catalog.yearly
            },
            revenueCat: catalog.revenueCat,
            features: active
                ? ['用藥提醒', '健康紀錄', 'AI 藥袋辨識 Pro 額度', '家人照護 Pro', '匯出與備份']
                : ['基本用藥提醒', '基本健康紀錄', '免費 AI 掃描', '獎勵廣告兌換']
        });
    });

    app.post('/api/subscription/revenuecat-sync', auth, (req, res) => {
        const { customerInfo } = req.body || {};
        if (!customerInfo || typeof customerInfo !== 'object') {
            return res.status(400).json({ error: '缺少 RevenueCat customerInfo' });
        }
        const pro = extractRevenueCatProStatus(customerInfo);
        dbRun(
            `INSERT INTO subscriptions (user_id, plan, entitlement, product_identifier, store, is_pro, expires_at, source, raw_customer_info, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
             ON CONFLICT(user_id) DO UPDATE SET
                plan=excluded.plan,
                entitlement=excluded.entitlement,
                product_identifier=excluded.product_identifier,
                store=excluded.store,
                is_pro=excluded.is_pro,
                expires_at=excluded.expires_at,
                source=excluded.source,
                raw_customer_info=excluded.raw_customer_info,
                updated_at=CURRENT_TIMESTAMP`,
            [
                req.user.id,
                pro.isPro ? planFromProduct(pro.productIdentifier) : 'free',
                SUBSCRIPTION_ENTITLEMENT_ID,
                pro.productIdentifier || null,
                pro.store || null,
                pro.isPro ? 1 : 0,
                pro.expiresAt || null,
                'revenuecat_client',
                JSON.stringify(customerInfo).slice(0, 60000)
            ]
        );
        saveDB();
        const sub = dbGet('SELECT * FROM subscriptions WHERE user_id=?', [req.user.id]);
        res.json({
            message: pro.isPro ? 'Pro 訂閱已同步' : '訂閱狀態已同步',
            plan: isSubscriptionActive(sub) ? (sub.plan || 'pro') : 'free',
            active: isSubscriptionActive(sub),
            expires_at: sub?.expires_at || null
        });
    });

    // ====== 健康目標 ======
    app.get('/api/health/goals', auth, (req, res) => {
        const g = dbGet('SELECT bp_sys_goal, bp_dia_goal, sugar_goal, weight_goal FROM user_settings WHERE user_id=?', [req.user.id]);
        res.json(g ? { goals: g } : { goals: { bp_sys_goal: null, bp_dia_goal: null, sugar_goal: null, weight_goal: null } });
    });

    app.put('/api/health/goals', auth, (req, res) => {
        const { bp_sys_goal, bp_dia_goal, sugar_goal, weight_goal } = req.body;
        // 確保每個值都有預設 null
        const bps = bp_sys_goal !== undefined ? bp_sys_goal : null;
        const bpd = bp_dia_goal !== undefined ? bp_dia_goal : null;
        const sg = sugar_goal !== undefined ? sugar_goal : null;
        const wg = weight_goal !== undefined ? weight_goal : null;
        dbRun('INSERT INTO user_settings (user_id, bp_sys_goal, bp_dia_goal, sugar_goal, weight_goal) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET bp_sys_goal=?, bp_dia_goal=?, sugar_goal=?, weight_goal=?',
            [req.user.id, bps, bpd, sg, wg, bps, bpd, sg, wg]);
        saveDB();
        res.json({ message: '目標已更新' });
    });

    // 用藥時間衝突檢查
    app.post('/api/medications/check-conflict', auth, (req, res) => {
        const { time_slots } = req.body;
        if (!time_slots || time_slots.length === 0) return res.json({ conflicts: [] });
        const existing = dbAll('SELECT drug_name, remind_time FROM medications WHERE user_id=? AND is_active=1', [req.user.id]);
        const conflicts = [];
        for (const med of existing) {
            let times = [];
            try { 
                times = typeof med.remind_time === 'string' ? JSON.parse(med.remind_time || '[]') : (Array.isArray(med.remind_time) ? med.remind_time : []);
                if (!Array.isArray(times)) times = [];
            } catch(e) { times = []; }
            for (const t of (times || [])) {
                for (const nt of time_slots) {
                    if (t === nt) conflicts.push({ drug: med.drug_name, time: t });
                }
            }
        }
        res.json({ conflicts });
    });

    // ====== 藥袋相簿 ======
    app.get('/api/medications/photos', auth, (req, res) => {
        const photos = dbAll('SELECT id, drug_name, medication_image, created_at FROM medications WHERE user_id=? AND medication_image IS NOT NULL ORDER BY created_at DESC', [req.user.id]);
        res.json({ photos });
    });

    // ====== 補藥計算 ======
    app.get('/api/medications/refill-status', auth, (req, res) => {
        const meds = dbAll('SELECT id, drug_name, total_quantity, remaining, daily_amount, refill_threshold FROM medications WHERE user_id=? AND is_active=1', [req.user.id]);
        const refills = meds.map(m => {
            const daily = m.daily_amount || 1;
            const remain = m.remaining || 0;
            const daysLeft = daily > 0 ? Math.floor(remain / daily) : 0;
            const refillDate = daysLeft > 0 ? new Date(Date.now() + daysLeft * 86400000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            const isLow = daysLeft <= (m.refill_threshold || 7);
            return { id: m.id, drug_name: m.drug_name, daily_amount: daily, remaining: remain, days_left: daysLeft, refill_date: refillDate, is_low: isLow };
        });
        res.json({ refills });
    });

    // ====== 家人留言（功能已停用） ======
    app.get('/api/family/messages', auth, (req, res) => {
        res.status(410).json({ error: '家人留言功能已停用' });
    });

    app.post('/api/family/messages', auth, (req, res) => {
        res.status(410).json({ error: '家人留言功能已停用' });
    });

    // ====== 健康數據對比 ======
    app.get('/api/health/compare', auth, (req, res) => {
        const thisMonth = new Date().toISOString().substring(0, 7);
        const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 7);
        const getStats = (month, uid) => {
            const bp = dbAll('SELECT blood_pressure_sys, blood_pressure_dia FROM health_records WHERE user_id=? AND record_date LIKE ?', [uid, month + '%']);
            const sugar = dbAll('SELECT blood_sugar FROM health_records WHERE user_id=? AND record_date LIKE ? AND blood_sugar IS NOT NULL', [uid, month + '%']);
            const weight = dbAll('SELECT weight FROM health_records WHERE user_id=? AND record_date LIKE ? AND weight IS NOT NULL', [uid, month + '%']);
            const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10 : null;
            return {
                bp_sys_avg: avg(bp.map(r=>r.blood_pressure_sys)),
                bp_dia_avg: avg(bp.map(r=>r.blood_pressure_dia)),
                sugar_avg: avg(sugar.map(r=>r.blood_sugar)),
                weight_avg: avg(weight.map(r=>r.weight)),
                bp_count: bp.length, sugar_count: sugar.length, weight_count: weight.length
            };
        };
        const current = getStats(thisMonth, req.user.id);
        const previous = getStats(lastMonth, req.user.id);
        const diff = (cur, prev) => cur !== null && prev !== null ? Math.round((cur - prev) * 10) / 10 : null;
        res.json({
            thisMonth, lastMonth,
            current, previous,
            changes: {
                bp_sys: diff(current.bp_sys_avg, previous.bp_sys_avg),
                bp_dia: diff(current.bp_dia_avg, previous.bp_dia_avg),
                sugar: diff(current.sugar_avg, previous.sugar_avg),
                weight: diff(current.weight_avg, previous.weight_avg)
            }
        });
    });

    // ====== 提醒延後 ======
    app.post('/api/medications/:id/snooze', auth, (req, res) => {
        const medId = req.params.id;
        const { remind_time, snooze_minutes } = req.body;
        const until = new Date(Date.now() + (snooze_minutes || 10) * 60000).toISOString();
        dbRun('INSERT INTO medication_logs (user_id, medication_id, remind_time, log_date, taken_status) VALUES (?,?,?,?,0)',
            [req.user.id, medId, remind_time, new Date().toISOString().split('T')[0]]);
        saveDB();
        res.json({ message: '已延後 ' + (snooze_minutes || 10) + ' 分鐘', snoozedUntil: until });
    });

    // ====== 一週用藥卡 ======
    app.get('/api/medications/weekly-card', auth, (req, res) => {
        const startOfWeek = new Date();
        const dayOfWeek = startOfWeek.getDay();
        const monday = new Date(startOfWeek);
        monday.setDate(startOfWeek.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const weekdays = ['一','二','三','四','五','六','日'];
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }
        const meds = dbAll('SELECT * FROM medications WHERE user_id=? AND is_active=1', [req.user.id]);
        const logs = dbAll(`SELECT medication_id, log_date, taken_status, remind_time FROM medication_logs WHERE user_id=? AND log_date >= ? AND log_date <= ?`,
            [req.user.id, dates[0], dates[6]]);
        // 按藥品和日期建立對照表
        const grid = meds.map(m => {
            const row = { drug_name: m.drug_name, dosage: m.dosage, days: [] };
            for (const date of dates) {
                const dayLogs = logs.filter(l => l.medication_id === m.id && l.log_date === date);
                row.days.push(dayLogs.length > 0 ? dayLogs.map(l => ({ time: l.remind_time, taken: !!l.taken_status })) : []);
            }
            return row;
        });
        res.json({ weekStart: dates[0], weekEnd: dates[6], weekdays, dates, grid });
    });

    // ====== 飲食交互檢查 ======
    app.get('/api/drugs/food-interactions', auth, (req, res) => {
        const drugName = req.query.name;
        const interactions = [
            { drug: '阿斯匹靈', food: '酒精', warning: '不可飲酒，增加胃出血風險' },
            { drug: '阿斯匹靈', food: '葡萄柚', warning: '避免葡萄柚汁，可能影響藥效' },
            { drug: '血壓藥', food: '葡萄柚', warning: '避免葡萄柚/柚子，可能使血壓過低' },
            { drug: '降血脂藥', food: '葡萄柚', warning: '避免葡萄柚，增加肌肉損傷風險' },
            { drug: '抗生素', food: '牛奶', warning: '避免與牛奶/鈣片同服，影響吸收' },
            { drug: '抗生素', food: '酒精', warning: '服藥期間不可飲酒' },
            { drug: '降血糖藥', food: '酒精', warning: '飲酒可能導致低血糖' },
            { drug: '止痛藥', food: '酒精', warning: '不可飲酒，增加肝損傷風險' },
            { drug: '甲狀腺藥', food: '牛奶', warning: '與牛奶/豆漿間隔 4 小時以上' },
            { drug: '鐵劑', food: '茶', warning: '避免與茶/咖啡同服，影響鐵吸收' },
            { drug: '安眠藥', food: '酒精', warning: '絕對不可飲酒，可能致命' },
            { drug: '胃藥', food: '酒精', warning: '避免飲酒，刺激胃黏膜' },
        ];
        if (drugName) {
            const results = interactions.filter(i =>
                i.drug.includes(drugName) || drugName.includes(i.drug) ||
                i.drug === drugName || i.drug.includes(drugName.substring(0,2))
            );
            return res.json({ interactions: results });
        }
        // 檢查使用者所有用藥
        const userMeds = dbAll('SELECT drug_name FROM medications WHERE user_id=? AND is_active=1', [req.user.id]);
        const allResults = [];
        for (const med of userMeds) {
            for (const inter of interactions) {
                if (med.drug_name.includes(inter.drug) || inter.drug.includes(med.drug_name)) {
                    allResults.push({ drug: med.drug_name, food: inter.food, warning: inter.warning });
                }
            }
        }
        res.json({ interactions: allResults });
    });

    // ====== 每日心情 ======
    app.get('/api/mood', auth, (req, res) => {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const mood = dbGet('SELECT mood, notes FROM mood_logs WHERE user_id=? AND log_date=?', [req.user.id, date]);
        const week = dbAll('SELECT log_date, mood FROM mood_logs WHERE user_id=? AND log_date >= ? ORDER BY log_date ASC',
            [req.user.id, new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]]);
        res.json({ today: mood, week });
    });

    app.post('/api/mood', auth, (req, res) => {
        const { mood, notes } = req.body;
        const date = new Date().toISOString().split('T')[0];
        dbRun('INSERT OR REPLACE INTO mood_logs (user_id, log_date, mood, notes) VALUES (?,?,?,?)',
            [req.user.id, date, mood, notes || null]);
        saveDB();
        res.json({ message: '心情已記錄' });
    });

    // ====== 備份還原 ======
    app.get('/api/backup/download', auth, adminAuth, (req, res) => {
        saveDB();
        const buffer = fs.readFileSync(DB_FILE);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment; filename=medremind_backup_' + new Date().toISOString().split('T')[0] + '.db');
        res.send(buffer);
    });

    app.post('/api/backup/restore', auth, adminAuth, upload.single('backup'), (req, res) => {
        // 讀取上傳的 DB 檔案並合併資料
        // 注意：簡化版 - 直接替換整個 DB
        if (!ENABLE_DB_RESTORE) {
            logAdminAction(req, 'backup.restore_blocked', {
                targetType: 'database',
                summary: 'production restore 被安全設定阻擋'
            });
            saveDB();
            return res.status(403).json({ error: '正式環境已關閉資料庫還原；如需還原，請先進入維護模式並設定 ENABLE_DB_RESTORE=true' });
        }
        if (!req.file) {
            return res.status(400).json({ error: '請上傳備份檔案' });
        }
        try {
            const preRestoreBackup = createAutomaticDBBackup('before-restore');
            const backupData = req.file.buffer;
            // 驗證是否為有效 SQLite 檔案
            const backupDB = new initSqlJs.Database(backupData);
            const userCheck = backupDB.exec('SELECT COUNT(*) FROM users');
            if (!userCheck || !userCheck.length) {
                backupDB.close();
                return res.status(400).json({ error: '備份檔案無效' });
            }
            backupDB.close();
            // 寫入備份
            const backupPath = DB_FILE + '.restore';
            fs.writeFileSync(backupPath, backupData);
            // 重新載入
            db.close();
            db = new SQL.Database(fs.readFileSync(backupPath));
            saveDB();
            fs.unlinkSync(backupPath);
            logAdminAction(req, 'backup.restore', {
                targetType: 'database',
                summary: '管理員還原整份資料庫',
                after: { pre_restore_backup: preRestoreBackup }
            });
            saveDB();
            res.json({ message: '備份已還原，請重新登入' });
        } catch (e) {
            console.error('Restore error:', e);
            res.status(500).json({ error: '備份檔案損毀或格式錯誤' });
        }
    });

    // ====== 家人查看長輩健康數據 ======
    app.get('/api/family/:fid/health', auth, (req, res) => {
        const rel = dbGet(
            'SELECT user_id, related_user_id, relationship FROM family_members WHERE id=? AND relationship IS NOT NULL AND (user_id=? OR related_user_id=?)',
            [req.params.fid, req.user.id, req.user.id]
        );
        if (!rel) return res.status(403).json({ error: '無權限查看此家庭資料' });
        const targetUserId = Number(rel.user_id) === Number(req.user.id) ? rel.related_user_id : rel.user_id;
        const records = dbAll('SELECT * FROM health_records WHERE user_id=? ORDER BY record_date DESC LIMIT 10', [targetUserId]);
        const goals = dbGet('SELECT bp_sys_goal, bp_dia_goal, sugar_goal, weight_goal FROM user_settings WHERE user_id=?', [targetUserId]);
        res.json({ elderId: targetUserId, records, goals });
    });

    // ====== 沒吃藥即時通知（標記未讀通知） ======
    app.post('/api/family/trigger-missed-alert', auth, (req, res) => {
        const elderId = parseInt(req.body.elder_id);
        if (!elderId || !hasFamilyAccess(req.user.id, elderId)) {
            return res.status(403).json({ error: '無權限發送此家人提醒' });
        }
        const elder = dbGet('SELECT id,name FROM users WHERE id=?', [elderId]);
        if (!elder) return res.status(404).json({ error: '家人不存在' });
        const elderName = String(req.body.elder_name || elder.name || '家人').trim().substring(0, 60);
        const drugName = String(req.body.drug_name || '用藥').trim().substring(0, 80);
        const remindTime = String(req.body.remind_time || '').trim().substring(0, 10);
        dbRun('INSERT INTO notifications (user_id, type, title, message, is_read) VALUES (?,?,?,?,0)',
            [req.user.id, 'missed_alert', '⚠️ 未吃藥提醒', elderName + ' 錯過了 ' + remindTime + ' 的 ' + drugName]);
        saveDB();
        res.json({ message: '通知已發送' });
    });

    // ====== 批次打卡 ======
    app.post('/api/medications/batch-checkin', auth, (req, res) => {
        const { medication_ids, remind_time } = req.body;
        if (!medication_ids || medication_ids.length === 0) return res.status(400).json({ error: '請選擇要打卡的藥品' });
        const today = new Date().toISOString().split('T')[0];
        let count = 0;
        for (const medId of medication_ids) {
            const med = dbGet('SELECT id, drug_name FROM medications WHERE id=? AND user_id=?', [medId, req.user.id]);
            if (!med) continue;
            dbRun('INSERT INTO medication_logs (medication_id, user_id, remind_time, taken_status, taken_at, log_date) VALUES (?,?,?,1,CURRENT_TIMESTAMP,?)',
                [medId, req.user.id, remind_time || new Date().toTimeString().substring(0,5), today]);
            dbRun('UPDATE medications SET remaining = CASE WHEN remaining > 0 THEN remaining - 1 ELSE 0 END WHERE id=? AND remaining > 0 AND user_id=?', [medId, req.user.id]);
            count++;
        }
        saveDB();
        res.json({ message: '已批次打卡 ' + count + ' 筆用藥' });
    });

    // ====== 匯出日曆（.ics 格式） ======
    app.get('/api/medications/export-ics', auth, (req, res) => {
        const meds = dbAll('SELECT drug_name, dosage, remind_time, duration_days, end_date FROM medications WHERE user_id=? AND is_active=1', [req.user.id]);
        let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MedCare Home//TW//\r\n';
        const now = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
        for (const med of meds) {
            let times = [];
            try {
                times = typeof med.remind_time === 'string' ? JSON.parse(med.remind_time || '[]') : (Array.isArray(med.remind_time) ? med.remind_time : []);
                if (!Array.isArray(times)) times = [];
            } catch(e) { times = []; }
            for (const t of times) {
                const [h, m] = t.split(':');
                const start = new Date();
                start.setHours(parseInt(h), parseInt(m), 0, 0);
                const end = new Date(start.getTime() + 15 * 60000);
                ics += 'BEGIN:VEVENT\r\n';
                ics += 'UID:' + med.id + '-' + t.replace(':','') + '@medremind\r\n';
                ics += 'DTSTAMP:' + now + '\r\n';
                ics += 'DTSTART:' + start.toISOString().replace(/[-:]/g,'').split('.')[0] + '\r\n';
                ics += 'DTEND:' + end.toISOString().replace(/[-:]/g,'').split('.')[0] + '\r\n';
                ics += 'SUMMARY:💊 ' + med.drug_name + ' ' + med.dosage + '\r\n';
                ics += 'RRULE:FREQ=DAILY\r\n';
                ics += 'BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:吃藥提醒\\n' + med.drug_name + ' ' + med.dosage + '\r\nTRIGGER:-PT10M\r\nEND:VALARM\r\n';
                ics += 'END:VEVENT\r\n';
            }
        }
        ics += 'END:VCALENDAR';
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=medremind_schedule.ics');
        res.send(ics);
    });

    // ====== 簡化模式 ======
    app.put('/api/user/simple-mode', auth, (req, res) => {
        const { enabled } = req.body;
        dbRun('INSERT INTO user_settings (user_id, simple_mode) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET simple_mode=?',
            [req.user.id, enabled ? 1 : 0, enabled ? 1 : 0]);
        saveDB();
        res.json({ message: enabled ? '簡化模式已啟用' : '簡化模式已停用' });
    });

    app.get('/api/user/simple-mode', auth, (req, res) => {
        const s = dbGet('SELECT simple_mode FROM user_settings WHERE user_id=?', [req.user.id]);
        res.json({ enabled: s ? !!s.simple_mode : false });
    });

    // ====== 最常錯過分析 ======
    app.get('/api/medications/miss-report', auth, (req, res) => {
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
        // 用藥統計
        const drugStats = dbAll(`
            SELECT m.drug_name, ml.remind_time,
                   COUNT(*) AS total, SUM(ml.taken_status) AS taken
            FROM medication_logs ml JOIN medications m ON ml.medication_id=m.id
            WHERE ml.user_id=? AND ml.log_date >= ?
            GROUP BY m.drug_name
            ORDER BY (COUNT(*) - SUM(ml.taken_status)) DESC`, [req.user.id, startDate]);
        // 時段統計
        const timeStats = dbAll(`
            SELECT ml.remind_time,
                   COUNT(*) AS total, SUM(ml.taken_status) AS taken
            FROM medication_logs ml
            WHERE ml.user_id=? AND ml.log_date >= ?
            GROUP BY ml.remind_time
            ORDER BY (COUNT(*) - SUM(ml.taken_status)) DESC`, [req.user.id, startDate]);
        res.json({
            drugStats: drugStats.map(d => ({ ...d, missed: d.total - (d.taken || 0), rate: d.total > 0 ? Math.round((d.taken || 0) / d.total * 100) : 0 })),
            timeStats: timeStats.map(t => ({ ...t, missed: t.total - (t.taken || 0), rate: t.total > 0 ? Math.round((t.taken || 0) / t.total * 100) : 0 })),
            days
        });
    });

    // ====== 智慧提醒建議 ======
    app.get('/api/medications/smart-suggest', auth, (req, res) => {
        const days = parseInt(req.query.days) || 14;
        const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
        const logs = dbAll(`
            SELECT m.drug_name, ml.remind_time, ml.taken_at
            FROM medication_logs ml JOIN medications m ON ml.medication_id=m.id
            WHERE ml.user_id=? AND ml.log_date >= ? AND ml.taken_status=1 AND ml.taken_at IS NOT NULL
            ORDER BY ml.taken_at`, [req.user.id, startDate]);
        // 分析每個提醒時間的實際打卡時間偏移
        const timeGroups = {};
        logs.forEach(l => {
            const scheduled = l.remind_time;
            const actual = l.taken_at.split('T')[1] ? l.taken_at.split('T')[1].substring(0, 5) : scheduled;
            if (!timeGroups[scheduled]) timeGroups[scheduled] = { times: [], offsets: [] };
            timeGroups[scheduled].times.push(actual);
            const sMin = parseInt(scheduled.split(':')[0]) * 60 + parseInt(scheduled.split(':')[1]);
            const aMin = parseInt(actual.split(':')[0]) * 60 + parseInt(actual.split(':')[1]);
            timeGroups[scheduled].offsets.push(aMin - sMin);
        });
        const suggestions = [];
        for (const [scheduled, data] of Object.entries(timeGroups)) {
            if (data.offsets.length < 3) continue;
            const avgOffset = Math.round(data.offsets.reduce((a,b)=>a+b,0) / data.offsets.length);
            if (Math.abs(avgOffset) < 5) continue;
            const newTime = new Date();
            const oldMin = parseInt(scheduled.split(':')[0]) * 60 + parseInt(scheduled.split(':')[1]);
            newTime.setHours(0, oldMin + avgOffset, 0, 0);
            const newTimeStr = String(newTime.getHours()).padStart(2,'0') + ':' + String(newTime.getMinutes()).padStart(2,'0');
            suggestions.push({ scheduled, avgOffset, newTime: newTimeStr, samples: data.offsets.length, direction: avgOffset > 0 ? '延後' : '提前' });
        }
        res.json({ suggestions });
    });

    // ====== BMI 與身高 ======
    app.put('/api/user/height', auth, (req, res) => {
        const { height } = req.body;
        if (!height || height < 50 || height > 250) return res.status(400).json({ error: '請輸入有效身高（50-250 cm）' });
        dbRun('INSERT INTO user_settings (user_id, height_cm) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET height_cm=?',
            [req.user.id, height, height]);
        saveDB();
        res.json({ message: '身高已更新' });
    });

    // ====== AI 問藥小幫手 ======
    app.post('/api/ai/medication-assistant', auth, async (req, res) => {
        const question = String(req.body.question || '').trim();
        if (!question) return res.status(400).json({ error: '請輸入問題' });
        const meds = dbAll('SELECT drug_name,dosage,usage_notes,remind_time FROM medications WHERE user_id=? AND is_active=1', [req.user.id]);
        const medSummary = meds.map(m => `${m.drug_name} ${m.dosage} ${(m.remind_time || '').replace(/[\[\]"]/g, '')} ${m.usage_notes || ''}`).join('；') || '尚無用藥資料';
        const fallback = `根據你目前記錄的用藥：${medSummary}。一般建議：請依藥袋與醫師/藥師指示服用；若出現不適、漏吃、想停藥或調整劑量，請先詢問醫師或藥師。`;
        if (!GEMINI_API_KEY) return res.json({ answer: fallback, disclaimer: '此回覆不是醫療診斷，不能取代醫師或藥師建議。' });
        try {
            const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `你是台灣用藥提醒 App 的安全助理。只能根據使用者已記錄用藥給一般提醒，不可診斷、不可建議自行停藥/加減藥。回答要繁體中文、簡短、加上「請向醫師或藥師確認」。\n目前用藥：${medSummary}\n使用者問題：${question}` }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 768 }
                })
            });
            const result = await response.json();
            const answer = result?.candidates?.[0]?.content?.parts?.[0]?.text || fallback;
            res.json({ answer, disclaimer: '此回覆不是醫療診斷，不能取代醫師或藥師建議。' });
        } catch(e) {
            res.json({ answer: fallback, disclaimer: '此回覆不是醫療診斷，不能取代醫師或藥師建議。' });
        }
    });

    // ====== 常用診所通訊錄 ======
    app.get('/api/clinics', auth, (req, res) => {
        const clinics = dbAll('SELECT * FROM clinic_contacts WHERE user_id=? ORDER BY name ASC', [req.user.id]);
        res.json({ clinics });
    });

    app.post('/api/clinics', auth, (req, res) => {
        const { name, phone, address, notes } = req.body;
        if (!name) return res.status(400).json({ error: '請輸入診所名稱' });
        dbRun('INSERT INTO clinic_contacts (user_id, name, phone, address, notes) VALUES (?,?,?,?,?)',
            [req.user.id, name, phone || null, address || null, notes || null]);
        saveDB();
        res.json({ message: '診所已新增' });
    });

    app.delete('/api/clinics/:id', auth, (req, res) => {
        dbRun('DELETE FROM clinic_contacts WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
        saveDB();
        res.json({ message: '已刪除' });
    });

    // ====== 家人週報 ======
    app.get('/api/report/weekly', auth, (req, res) => {
        const uid = req.user.id;
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        // 用藥遵從
        const logs = dbAll('SELECT log_date, taken_status FROM medication_logs WHERE user_id=? AND log_date >= ?', [uid, weekAgo]);
        const adherence = {};
        logs.forEach(l => {
            if (!adherence[l.log_date]) adherence[l.log_date] = { taken: 0, total: 0 };
            adherence[l.log_date].total++;
            if (l.taken_status) adherence[l.log_date].taken++;
        });
        const totalTaken = Object.values(adherence).reduce((s,d) => s + d.taken, 0);
        const totalReminders = Object.values(adherence).reduce((s,d) => s + d.total, 0);
        const rate = totalReminders > 0 ? Math.round(totalTaken / totalReminders * 100) : 0;
        // 心情
        const moods = dbAll('SELECT log_date, mood FROM mood_logs WHERE user_id=? AND log_date >= ? ORDER BY log_date', [uid, weekAgo]);
        // 健康
        const bp = dbAll('SELECT blood_pressure_sys, blood_pressure_dia, record_date FROM health_records WHERE user_id=? AND record_date >= ? AND blood_pressure_sys IS NOT NULL ORDER BY record_date DESC LIMIT 3', [uid, weekAgo]);
        const sugar = dbAll('SELECT blood_sugar, record_date FROM health_records WHERE user_id=? AND record_date >= ? AND blood_sugar IS NOT NULL ORDER BY record_date DESC LIMIT 3', [uid, weekAgo]);
        const user = dbGet('SELECT name, age FROM users WHERE id=?', [uid]);
        res.json({
            user, weekStart: weekAgo, weekEnd: today,
            adherence: { rate, totalTaken, totalReminders },
            moods, bp, sugar,
            generatedAt: new Date().toISOString()
        });
    });

    // ====== 啟動 ======
    app.listen(PORT, HOST, () => {
        console.log(`💊 藥護家 App 伺服器已啟動：http://${HOST}:${PORT}`);
        if (CREATE_DEMO_DATA) {
            console.log(`🔑 測試帳號：wang@example.com / 123456`);
            console.log(`🔑 測試帳號：li@example.com / 123456`);
        }
        if (ADMIN_EMAIL) console.log(`🔧 管理員帳號：${ADMIN_EMAIL}`);
    });
}
init().catch(e => { console.error('初始化失敗:', e); process.exit(1); });
