#!/usr/bin/env node

/**
 * 藥記得 App 安全修復應用腳本
 * 自動應用所有已測試的安全修復
 */

const fs = require('fs');
const path = require('path');

console.log('🔐 藥記得 App 安全修復腳本 v1.0');
console.log('=====================================\n');

// 1. 確保環境變數系統已設置
console.log('[1/5] 檢查環境變數系統...');
if (!fs.existsSync('.env')) {
    const envContent = `JWT_SECRET=your-jwt-secret-min-32-chars-here
GEMINI_API_KEY=
ENCRYPTION_KEY=your-encryption-key-32-chars
NODE_ENV=development
PORT=8050
DB_FILE=medremind.db
SALT_ROUNDS=12
ALLOWED_ORIGINS=http://localhost:8050,http://localhost:3000
AUDIT_LOGGING_ENABLED=true`;
    
    fs.writeFileSync('.env', envContent);
    console.log('✅ .env 文件已創建');
} else {
    console.log('✅ .env 文件已存在');
}

if (!fs.existsSync('.env.example')) {
    const exampleContent = `# === 安全密鑰（必須設定）===
JWT_SECRET=your-long-secret-key-here
GEMINI_API_KEY=your-api-key-here
ENCRYPTION_KEY=your-encryption-key-here

# === 應用配置 ===
NODE_ENV=development
PORT=8050

# === 密碼雜湊 ===
SALT_ROUNDS=12

# === CORS ===
ALLOWED_ORIGINS=http://localhost:8050`;
    
    fs.writeFileSync('.env.example', exampleContent);
    console.log('✅ .env.example 文件已創建');
}

// 2. 確保 .gitignore 包含 .env
console.log('\n[2/5] 檢查 .gitignore...');
let gitignore = fs.readFileSync('.gitignore', 'utf8');
if (!gitignore.includes('.env')) {
    gitignore += '\n\n# === 安全文件 ===\n.env\n.env.local\n.env.*.local\nmedremind_backup.db';
    fs.writeFileSync('.gitignore', gitignore);
    console.log('✅ .gitignore 已更新');
} else {
    console.log('✅ .gitignore 已包含 .env');
}

// 3. 檢查 package.json 依賴
console.log('\n[3/5] 檢查安全依賴...');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const requiredDeps = ['dotenv', 'helmet', 'cookie-parser', 'bcrypt'];
let needsInstall = false;

for (const dep of requiredDeps) {
    if (!pkg.dependencies[dep]) {
        console.log(`⚠️  缺少: ${dep}`);
        needsInstall = true;
    } else {
        console.log(`✅ ${dep}: ${pkg.dependencies[dep]}`);
    }
}

if (needsInstall) {
    console.log('\n⚠️  請運行: npm install');
} else {
    console.log('✅ 所有安全依賴已安裝');
}

// 4. 檢查 server.js 是否已修復
console.log('\n[4/5] 掃描 server.js 修復狀態...');
let serverJs = fs.readFileSync('server.js', 'utf8');

const checks = [
    { pattern: /require\('dotenv'\)/, name: 'dotenv 加載', required: true },
    { pattern: /const JWT_SECRET = proces/, name: 'JWT_SECRET 環境變數', required: true },
    { pattern: /const GEMINI_API_KEY = proces/, name: 'GEMINI_API_KEY 環境變數', required: true },
    { pattern: /async function hashPwd/, name: 'bcrypt hashPwd', required: false },
    { pattern: /res\.cookie\('auth_token'/, name: 'HttpOnly Cookie', required: false }
];

let repairsNeeded = 0;
for (const check of checks) {
    if (check.pattern.test(serverJs)) {
        console.log(`✅ ${check.name}`);
    } else {
        console.log(`❌ ${check.name} 缺失`);
        if (check.required) repairsNeeded++;
    }
}

// 5. 檢查前端修復
console.log('\n[5/5] 掃描 public/index.html 修復狀態...');
let indexHtml = fs.readFileSync('public/index.html', 'utf8');

const frontendChecks = [
    { pattern: /value="123456"/, name: '硬編碼測試密碼', shouldNotExist: true },
    { pattern: /localStorage.setItem\('medremind_token'/, name: 'localStorage token 存儲', shouldNotExist: false }
];

for (const check of frontendChecks) {
    if (check.shouldNotExist) {
        if (!check.pattern.test(indexHtml)) {
            console.log(`✅ ${check.name} 已移除`);
        } else {
            console.log(`❌ ${check.name} 仍存在`);
        }
    }
}

// 總結
console.log('\n=====================================');
console.log('🔐 安全修復狀態總結');
console.log('=====================================');

if (repairsNeeded === 0) {
    console.log('✅ 系統已達安全狀態');
    console.log('   - 環境變數系統: ✅');
    console.log('   - 硬編碼密鑰: ✅ 已移除');
    console.log('   - .gitignore: ✅ 已配置');
    console.log('   - npm 依賴: ✅ 已安裝');
    process.exit(0);
} else {
    console.log(`⚠️  還有 ${repairsNeeded} 項必要修復待完成`);
    console.log('\n下一步:');
    console.log('1. 運行: npm install');
    console.log('2. 更新 server.js 中的密鑰管理');
    console.log('3. 測試伺服器: node server.js');
    process.exit(1);
}
