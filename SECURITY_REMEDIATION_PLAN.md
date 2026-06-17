# 🔐 藥記得 App 資安修復行動計畫

**計畫開始:** 2026-06-16 21:05 GMT+8  
**優先級:** 🔴 **立即執行**  
**狀態:** 📋 待執行

---

## 📊 修復時間表

### 🔴 **Phase 1：緊急修復（本周完成）**
| # | 任務 | 難度 | 時間 | 優先級 | 狀態 |
|---|------|------|------|--------|------|
| 1 | 移除硬編碼密鑰，使用 .env | 🟢 簡 | 30分 | P0 | ⏳ |
| 2 | Token 改用 HttpOnly Cookie | 🟠 中 | 2小時 | P0 | ⏳ |
| 3 | 修復 CORS 配置 | 🟢 簡 | 1小時 | P0 | ⏳ |
| 4 | HTTPS 強制重定向 | 🟢 簡 | 1小時 | P0 | ⏳ |
| 5 | 移除硬編碼測試密碼 | 🟢 簡 | 30分 | P0 | ⏳ |
| **小計** | | | **4.5小時** | | |

### 🟠 **Phase 2：重要修復（2 周內完成）**
| # | 任務 | 難度 | 時間 | 優先級 | 狀態 |
|---|------|------|------|--------|------|
| 6 | 升級密碼雜湊為 bcrypt | 🟠 中 | 2小時 | P1 | ⏳ |
| 7 | 健康數據加密 | 🟠 中 | 4小時 | P1 | ⏳ |
| 8 | 備份加密 | 🟠 中 | 2小時 | P1 | ⏳ |
| 9 | 添加審計日誌系統 | 🟠 中 | 4小時 | P1 | ⏳ |
| 10 | 強化速率限制 | 🟠 中 | 2小時 | P1 | ⏳ |
| **小計** | | | **14小時** | | |

### 🟡 **Phase 3：優化改進（1 月內完成）**
| # | 任務 | 難度 | 時間 | 優先級 | 狀態 |
|---|------|------|------|--------|------|
| 11 | 數據最小化策略 | 🟠 中 | 3小時 | P2 | ⏳ |
| 12 | 用戶同意管理系統 | 🔴 難 | 6小時 | P2 | ⏳ |
| 13 | 安全標頭（Helmet） | 🟢 簡 | 1小時 | P2 | ⏳ |
| 14 | 違規通知機制 | 🔴 難 | 4小時 | P2 | ⏳ |
| 15 | 定期滲透測試流程 | 🟠 中 | 2小時 | P2 | ⏳ |
| **小計** | | | **16小時** | | |

---

## 🚀 **Phase 1：緊急修復（立即開始）**

### 步驟 1.1：環境變數配置

**檔案:** `.env`（新建）

```env
# === 安全密鑰 ===
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
GEMINI_API_KEY=your-actual-gemini-api-key-here
ENCRYPTION_KEY=your-encryption-key-32-characters-here
SALT_ROUNDS=12

# === 應用配置 ===
NODE_ENV=production
PORT=8050
DB_FILE=medremind.db

# === 資料庫配置 ===
DB_BACKUP_ENABLED=true
DB_BACKUP_INTERVAL=86400000  # 每 24 小時

# === CORS 配置 ===
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com,http://localhost:8050

# === 審計日誌 ===
AUDIT_LOGGING_ENABLED=true
```

**更新:** `.gitignore`
```
.env
.env.local
.env.*.local
medremind_backup.db
medremind.db
```

**檢查:** 確認 `.env` 已添加到 `.gitignore`
```bash
git rm --cached .env 2>/dev/null || true
```

---

### 步驟 1.2：更新伺服器代碼

**檔案:** `server.js`

#### 修改 1：加載環境變數
```javascript
// server.js 最開始
require('dotenv').config();

const express = require('express');
// ... 其他 imports
```

**安裝依賴：**
```bash
npm install dotenv helmet express-rate-limit
```

#### 修改 2：使用環境變數
```javascript
// ❌ 移除這些
// const JWT_SECRET = 'yaojide_medremind_secret_key_2026';
// const GEMINI_API_KEY = 'AIzaSyBm1GvPu-yVsVOGv3TlJtf1GVcuxQPA20A';

// ✅ 改為這些
const JWT_SECRET = process.env.JWT_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || '12');

// 驗證必須的環境變數
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('❌ JWT_SECRET 必須設定且長度 ≥ 32 字元');
}

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    throw new Error('❌ ENCRYPTION_KEY 必須設定且長度 ≥ 32 字元');
}
```

#### 修改 3：安全標頭
```javascript
const helmet = require('helmet');
app.use(helmet());

// 添加額外的安全標頭
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});
```

#### 修改 4：HTTPS 強制
```javascript
// 生產環境強制 HTTPS
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            res.redirect(`https://${req.header('host')}${req.url}`);
        } else {
            next();
        }
    });
}
```

#### 修改 5：CORS 白名單
```javascript
// ❌ 移除
// app.use(cors());

// ✅ 改為
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8050').split(',');

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS 不允許此來源'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400  // 24 小時
}));
```

---

### 步驟 1.3：前端 Token 修復

**檔案:** `public/index.html`

#### 修改：移除 localStorage token 存儲

**找到這段代碼：**
```javascript
function setToken(token) {
    authToken = token;
    localStorage.setItem('medremind_token', token);
}
```

**替換為：**
```javascript
function setToken(token) {
    authToken = token;
    // Token 現在存儲在 HttpOnly Cookie 中（由伺服器設定）
    // 前端只保留內存副本用於 API 調用
}

function getToken() {
    // Token 會自動在 Cookie 中發送
    // 不需要從 localStorage 讀取
    return authToken;
}
```

#### 修改：清除登出時的 localStorage
```javascript
function handleLogout() {
    authToken = null;
    localStorage.removeItem('medremind_token');  // 清除舊的 localStorage token
    // 新的 Cookie token 會由伺服器通過 Set-Cookie: max-age=0 清除
    clearToken();
    showLogin();
}
```

---

### 步驟 1.4：伺服器端設置 Cookie

**檔案:** `server.js` - 登入和註冊 API

#### 修改：登入端點
```javascript
app.post('/api/login', (req, res) => {
    // ... 現有的驗證代碼 ...
    
    const token = jwt.sign({ id:u.id, name:u.name, email:u.email, role: u.role || 'user' }, JWT_SECRET, { expiresIn: '30d' });
    
    // ✅ 添加 HttpOnly Cookie
    res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 天
        path: '/'
    });
    
    res.json({ message:'登入成功', token, user:{...} });
});
```

#### 修改：認證中間件
```javascript
function auth(req, res, next) {
    // ✅ 從 Cookie 或 Header 讀取 token
    let token = req.cookies.auth_token;
    if (!token) {
        token = (req.headers['authorization'] || '').split(' ')[1];
    }
    
    if (!token) return res.status(401).json({ error: '請先登入' });
    try { 
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        res.status(403).json({ error: '登入已過期' });
    }
}
```

**安裝 cookie-parser：**
```bash
npm install cookie-parser
```

**在 server.js 最開始：**
```javascript
const cookieParser = require('cookie-parser');
app.use(cookieParser());
```

---

### 步驟 1.5：移除硬編碼測試數據

**檔案:** `public/index.html`

**找到：**
```html
<input type="password" id="login-password" class="form-input" placeholder="輸入密碼" value="123456">
```

**改為：**
```html
<input type="password" id="login-password" class="form-input" placeholder="輸入密碼">
```

---

## 🧪 **Phase 1 驗證檢查清單**

完成上述修改後，運行以下驗證：

```bash
# 1. 檢查 .env 已添加到 .gitignore
$ grep ".env" .gitignore || echo "❌ .env 未在 .gitignore 中"

# 2. 檢查無硬編碼密鑰在源代碼中
$ grep -r "AIzaSy\|yaojide_medremind_secret" . --exclude-dir=node_modules && echo "❌ 仍有硬編碼密鑰" || echo "✅ 密鑰已移除"

# 3. 檢查 CORS 配置
$ grep "allowedOrigins\|ALLOWED_ORIGINS" server.js && echo "✅ CORS 已修復" || echo "❌ CORS 未修復"

# 4. 啟動伺服器測試
$ cp .env.example .env
$ NODE_ENV=development npm start

# 5. 檢查 HTTPS 重定向（生產環境）
$ NODE_ENV=production node server.js &
$ curl -i http://localhost:8050/api/health
# 預期：302 重定向到 HTTPS 或 200 如果未在生產環境

# 6. Cookie 測試
$ curl -i -X POST http://localhost:8050/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"wang@example.com","password":"123456"}' \
  | grep -i "set-cookie"
# 預期：看到 Set-Cookie: auth_token=...;HttpOnly;Secure;...
```

---

## 📋 **Phase 2：重要修復（2 周內）**

### 步驟 2.1：升級密碼雜湊

```bash
npm install bcrypt
```

**檔案:** `server.js`

```javascript
const bcrypt = require('bcrypt');

// ❌ 移除舊函數
// function hashPwd(p) { return crypto.createHash('sha256').update(p + 'yaojide_salt').digest('hex'); }

// ✅ 新函數（異步）
async function hashPwd(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPwd(password, hash) {
    return await bcrypt.compare(password, hash);
}

// 更新所有使用密碼雜湊的地方（註冊、登入等）
app.post('/api/register', async (req, res) => {
    // ...
    const hash = await hashPwd(password);
    // ...
});

app.post('/api/login', async (req, res) => {
    // ...
    const isValid = await verifyPwd(password, u.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Email 或密碼錯誤' });
    // ...
});
```

---

### 步驟 2.2：健康數據加密

```javascript
const crypto = require('crypto');

function encryptField(value) {
    if (!value) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        Buffer.from(ENCRYPTION_KEY, 'hex'),
        iv
    );
    let encrypted = cipher.update(String(value), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + encrypted + ':' + authTag.toString('hex');
}

function decryptField(encrypted) {
    if (!encrypted) return null;
    const [iv, enc, tag] = encrypted.split(':');
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(ENCRYPTION_KEY, 'hex'),
        Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let decrypted = decipher.update(enc, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// 使用：在存儲和讀取敏感字段時
dbRun(
    'INSERT INTO health_records (..., blood_pressure_sys_enc) VALUES (..., ?)',
    [encryptField(bloodPressure)]
);

const encrypted = dbGet('SELECT blood_pressure_sys_enc FROM health_records WHERE id=?', [id]);
const decrypted = decryptField(encrypted.blood_pressure_sys_enc);
```

---

## ⏰ **執行時間表**

| 週次 | 完成項目 | 預計時間 |
|------|---------|---------|
| **第 1 週** | Phase 1 全部修復 | 4.5 小時 |
| **第 2 週** | Phase 2 項目 6-10 | 14 小時 |
| **第 3-4 週** | Phase 3 項目 11-15 | 16 小時 |
| **總計** | 全部修復 | **34.5 小時** |

---

## ✅ **修復完成的標誌**

修復成功完成時應具備：

- [ ] `.env` 文件存在且包含所有密鑰
- [ ] `.env` 已添加到 `.gitignore`
- [ ] 伺服器代碼中無硬編碼密鑰
- [ ] Token 存儲在 HttpOnly Cookie 中
- [ ] CORS 已限制到特定來源
- [ ] HTTPS 強制已啟用（生產環境）
- [ ] 密碼使用 bcrypt 雜湊
- [ ] 敏感健康數據已加密
- [ ] 備份文件已加密
- [ ] 審計日誌系統已實施
- [ ] 所有測試通過
- [ ] 安全標頭已配置
- [ ] 速率限制已強化

---

## 📞 **支援與問題**

如在修復過程中遇到問題：

1. **詢問資安管家** - 進行滲透測試驗證
2. **檢查日誌** - `server.log` 中查找錯誤信息
3. **測試端點** - 使用 Postman 或 curl 驗證 API

---

**計畫制定:** 2026-06-16 21:20 GMT+8  
**狀態:** 📋 **待開始執行**  
**預計完成:** 2026-07-07（3 周）
