-- 藥記得 App 資料庫結構
-- 使用 SQLite (sql.js 相容)

-- 用戶表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    age INTEGER,
    role TEXT DEFAULT 'user',
    device_identifier_hash TEXT UNIQUE,
    account_code TEXT UNIQUE,
    account_source TEXT DEFAULT 'email',
    last_device_login_at DATETIME,
    email_verified INTEGER DEFAULT 0,
    email_verified_at DATETIME,
    email_verification_token_hash TEXT,
    email_verification_expires_at DATETIME,
    password_reset_token_hash TEXT,
    password_reset_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 商店內訂閱狀態
CREATE TABLE IF NOT EXISTS subscriptions (
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 用藥記錄表
CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    drug_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    usage_notes TEXT,
    remind_time TEXT NOT NULL,  -- JSON: ["08:00", "12:00", "20:00"]
    duration_days INTEGER,       -- 用藥天數，超過後自動刪除
    end_date DATE,               -- 預計結束日期
    is_active INTEGER DEFAULT 1,
    total_quantity INTEGER,
    remaining INTEGER,
    daily_amount REAL DEFAULT 1,
    refill_threshold INTEGER DEFAULT 7,
    medication_image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 用藥打卡記錄
CREATE TABLE IF NOT EXISTS medication_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    medication_id INTEGER NOT NULL,
    remind_time TEXT NOT NULL,  -- 提醒時間 "08:00"
    taken_status INTEGER DEFAULT 0,  -- 0=未吃, 1=已吃
    taken_at DATETIME,
    log_date DATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (medication_id) REFERENCES medications(id)
);

-- 健康數據記錄
CREATE TABLE IF NOT EXISTS health_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    record_date DATE NOT NULL,
    blood_pressure_sys INTEGER,    -- 收縮壓
    blood_pressure_dia INTEGER,    -- 舒張壓
    blood_sugar REAL,              -- 血糖
    weight REAL,                   -- 體重
    sleep_hours REAL,              -- 睡眠時數
    mood TEXT,                     -- 今日感受
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 家庭關聯表
CREATE TABLE IF NOT EXISTS family_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    related_user_id INTEGER NOT NULL,
    relationship TEXT NOT NULL,     -- 子女、配偶、父母等
    permission_level TEXT DEFAULT 'view',  -- view/edit
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (related_user_id) REFERENCES users(id)
);

-- 推送通知記錄
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,             -- medication_remind, family_alert
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    status TEXT DEFAULT 'unread',    -- unread/read/done/snoozed
    snooze_until DATETIME,
    action_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 家人邀請碼
CREATE TABLE IF NOT EXISTS family_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inviter_user_id INTEGER NOT NULL,
    code TEXT UNIQUE NOT NULL,
    relationship TEXT DEFAULT '家人',
    expires_at DATETIME,
    used_by INTEGER,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inviter_user_id) REFERENCES users(id),
    FOREIGN KEY (used_by) REFERENCES users(id)
);

-- 藥物資訊庫
CREATE TABLE IF NOT EXISTS drug_database (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drug_name TEXT NOT NULL,
    generic_name TEXT,
    indications TEXT,              -- 適應症
    side_effects TEXT,             -- 副作用
    dosage_common TEXT,            -- 常見劑量
    usage_notes TEXT,              -- 服用須知
    category TEXT                  -- 藥品分類
);

-- 藥物交互作用警示
CREATE TABLE IF NOT EXISTS drug_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drug1 TEXT NOT NULL,
    drug2 TEXT NOT NULL,
    severity TEXT NOT NULL,        -- high/medium/low
    description TEXT NOT NULL
);

-- 用戶設定
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    reminder_repeat INTEGER DEFAULT 0,  -- 0=關閉 1=開啟重複提醒
    telegram_chat_id TEXT,
    onboarding_completed INTEGER DEFAULT 0,
    large_font INTEGER DEFAULT 0,
    bp_sys_goal INTEGER,
    bp_dia_goal INTEGER,
    sugar_goal REAL,
    weight_goal REAL,
    height_cm REAL,
    simple_mode INTEGER DEFAULT 0,
    pin_code TEXT,
    pin_enabled INTEGER DEFAULT 0,
    reminder_sound TEXT DEFAULT 'classic',
    desktop_mode INTEGER DEFAULT 0,
    family_alert_delay_minutes INTEGER DEFAULT 60,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 用藥日記
CREATE TABLE IF NOT EXISTS medication_diary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    medication_id INTEGER NOT NULL,
    mood TEXT,
    side_effects TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (medication_id) REFERENCES medications(id)
);

-- 回診提醒
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    appointment_date DATE NOT NULL,
    clinic_name TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 家人留言
CREATE TABLE IF NOT EXISTS family_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (target_user_id) REFERENCES users(id)
);

-- 心情記錄
CREATE TABLE IF NOT EXISTS mood_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    log_date DATE NOT NULL,
    mood TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, log_date)
);

-- 診所通訊錄
CREATE TABLE IF NOT EXISTS clinic_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 緊急聯絡人
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    relationship TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 用藥異動紀錄
CREATE TABLE IF NOT EXISTS medication_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    medication_id INTEGER,
    drug_name TEXT,
    change_type TEXT NOT NULL,
    before_value TEXT,
    after_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
