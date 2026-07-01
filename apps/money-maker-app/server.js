require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 8092);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_PREFIX = "/money-maker-api";
const DATA_DIR = process.env.MONEY_MAKER_DATA_DIR || path.join(__dirname, "private_data", "vaults");
const MAX_SYNC_RECORDS = 1000;
const MAX_SYNC_BYTES = 1_500_000;

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: "16mb" }));
app.use((req, _res, next) => {
  if (req.url === API_PREFIX || req.url.startsWith(`${API_PREFIX}/`)) {
    req.url = req.url.slice(API_PREFIX.length) || "/";
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));

const scanTemplates = {
  hotai: {
    label: "和泰托運紀錄",
    fields: {
      delivery_date: "配送日期，保留單據上的日期時間格式",
      serial_no: "流水號，例如 HC11 269340",
      route_code: "運送區間，例如 R21",
      extra_fee: "附加費用，數字，沒有則填 0"
    },
    notes: [
      "這是和泰汽車外車託運單。",
      "只回傳指定四欄，不要加入車號、司機、品名或其他欄位。"
    ]
  },
  taichung: {
    label: "泰中托運紀錄",
    fields: {
      vendor_name: "廠商名稱。必須抓單據左側「廠商：」欄位後面的手寫或蓋章內容",
      delivery_date: "送貨日期，保留單據上的日期格式，例如 115.5.27",
      order_no: "單號，通常在右上角 No 後面，例如 041705"
    },
    notes: [
      "這是泰中金屬股份有限公司送貨單。",
      "表頭公司名稱「泰中金屬股份有限公司」不是廠商名稱，不可填入 vendor_name。",
      "vendor_name 只看左側「廠商：」欄位，辨識不清楚就填空字串並把信心值降低。"
    ]
  },
  fuel: {
    label: "油耗成本紀錄",
    fields: {
      fuel_date: "加油日期",
      liters: "公升數，數字",
      amount: "加油金額，數字",
      odometer: "目前里程或行駛公里數，數字",
      fuel_type: "油品，沒有就填空字串"
    },
    notes: [
      "這可能是加油發票、收據或手寫紀錄。",
      "只抓和油耗成本相關的欄位。"
    ]
  },
  maintenance: {
    label: "保養紀錄",
    fields: {
      service_date: "保養日期",
      plate_no: "車牌號碼",
      shop_name: "店家或保修廠名稱",
      items: "保養項目或零件耗材明細，用短句陣列",
      labor_total: "工資合計，數字",
      parts_total: "零件合計，數字",
      tax: "稅金，數字",
      total_due: "應收合計，數字",
      paid_status: "已收、未收或空字串"
    },
    notes: [
      "這是保養或維修成本單據。",
      "items 請保留主要保養項目、零件和耗材，不要編造看不到的內容。"
    ]
  }
};

function buildPrompt(type) {
  const template = scanTemplates[type] || scanTemplates.hotai;
  return [
    `你是台灣物流與車輛成本單據 OCR 結構化助手。請辨識圖片中的「${template.label}」。`,
    "請只輸出 JSON，不要 Markdown，不要解釋。",
    "如果欄位看不清楚，填空字串或 0，不要猜太遠。",
    "每個欄位都要附 confidence，範圍 0 到 1。",
    "欄位定義：",
    JSON.stringify(template.fields, null, 2),
    "重要規則：",
    template.notes.map((note) => `- ${note}`).join("\n"),
    "輸出格式：",
    JSON.stringify({
      type,
      fields: Object.fromEntries(Object.keys(template.fields).map((key) => [key, ""])),
      confidence: Object.fromEntries(Object.keys(template.fields).map((key) => [key, 0])),
      raw_text: "",
      warnings: []
    }, null, 2)
  ].join("\n\n");
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl || "");
  if (!match) {
    return null;
  }
  return { mimeType: match[1], data: match[2] };
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  }
}

function sanitizeResult(type, result, rawText) {
  const template = scanTemplates[type] || scanTemplates.hotai;
  const allowedKeys = Object.keys(template.fields);
  const fields = {};
  const confidence = {};
  for (const key of allowedKeys) {
    const value = result && result.fields ? result.fields[key] : "";
    fields[key] = Array.isArray(value) ? value : (value ?? "");
    const score = Number(result && result.confidence ? result.confidence[key] : 0);
    confidence[key] = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  }
  return {
    type,
    fields,
    confidence,
    raw_text: String((result && result.raw_text) || rawText || ""),
    warnings: Array.isArray(result && result.warnings) ? result.warnings.slice(0, 6) : []
  };
}

function isValidVaultKey(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

function vaultHash(vaultKey) {
  return crypto.createHash("sha256").update(`money-maker-vault-id:${vaultKey}`).digest("hex");
}

function vaultFile(vaultKey) {
  return path.join(DATA_DIR, `${vaultHash(vaultKey)}.json`);
}

function vaultEncryptionKey(vaultKey) {
  return crypto.createHash("sha256").update(`money-maker-vault-data:${vaultKey}`).digest();
}

function encryptVault(vaultKey, payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultEncryptionKey(vaultKey), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: 1,
    key_hash: vaultHash(vaultKey),
    updated_at: payload.updated_at,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64")
  };
}

function decryptVault(vaultKey, envelope) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    vaultEncryptionKey(vaultKey),
    Buffer.from(envelope.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final()
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

function sanitizeRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const id = typeof record.id === "string" && record.id.length <= 80 ? record.id : "";
  const type = typeof record.type === "string" && scanTemplates[record.type] ? record.type : "";
  if (!id || !type) return null;
  const clean = {};
  for (const [key, value] of Object.entries(record)) {
    if (!/^[a-zA-Z0-9_]+$/.test(key) || key.length > 40) continue;
    if (Array.isArray(value)) {
      clean[key] = value.slice(0, 100).map((item) => String(item ?? "").slice(0, 2000));
    } else if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      clean[key] = typeof value === "string" ? value.slice(0, 10000) : value;
    }
  }
  clean.id = id;
  clean.type = type;
  clean.updated_at = typeof clean.updated_at === "string" ? clean.updated_at : new Date().toISOString();
  return clean;
}

function sanitizeRecords(records) {
  if (!Array.isArray(records)) return null;
  const clean = records.slice(0, MAX_SYNC_RECORDS).map(sanitizeRecord).filter(Boolean);
  const serialized = JSON.stringify(clean);
  if (Buffer.byteLength(serialized, "utf8") > MAX_SYNC_BYTES) return null;
  return clean;
}

async function readVault(vaultKey) {
  try {
    const raw = await fs.readFile(vaultFile(vaultKey), "utf8");
    const envelope = JSON.parse(raw);
    if (envelope.key_hash !== vaultHash(vaultKey)) return null;
    return decryptVault(vaultKey, envelope);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeVault(vaultKey, records) {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const payload = {
    records,
    updated_at: new Date().toISOString()
  };
  const file = vaultFile(vaultKey);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(encryptVault(vaultKey, payload)), { mode: 0o600 });
  await fs.rename(temp, file);
  return payload;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "賺大錢",
    model: GEMINI_MODEL,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

app.post("/api/private-sync/pull", async (req, res) => {
  try {
    const { vault_key: vaultKey } = req.body || {};
    if (!isValidVaultKey(vaultKey)) {
      return res.status(403).json({ error: "私有同步碼無效" });
    }
    const vault = await readVault(vaultKey);
    res.set("Cache-Control", "no-store");
    res.json({
      records: vault && Array.isArray(vault.records) ? vault.records : [],
      updated_at: vault ? vault.updated_at : null
    });
  } catch (error) {
    res.status(500).json({ error: "同步讀取失敗", detail: error.message });
  }
});

app.put("/api/private-sync/push", async (req, res) => {
  try {
    const { vault_key: vaultKey, records } = req.body || {};
    if (!isValidVaultKey(vaultKey)) {
      return res.status(403).json({ error: "私有同步碼無效" });
    }
    const clean = sanitizeRecords(records);
    if (!clean) {
      return res.status(400).json({ error: "同步資料格式太大或無效" });
    }
    const vault = await writeVault(vaultKey, clean);
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      count: clean.filter((record) => !record.deleted_at).length,
      updated_at: vault.updated_at
    });
  } catch (error) {
    res.status(500).json({ error: "同步寫入失敗", detail: error.message });
  }
});

app.post("/api/ai-scan", async (req, res) => {
  try {
    const { type, image } = req.body || {};
    if (!scanTemplates[type]) {
      return res.status(400).json({ error: "不支援的掃描類型" });
    }
    const parsedImage = parseDataUrl(image);
    if (!parsedImage) {
      return res.status(400).json({ error: "請上傳圖片" });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "尚未設定 GEMINI_API_KEY" });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: buildPrompt(type) },
            { inlineData: { mimeType: parsedImage.mimeType, data: parsedImage.data } }
          ]
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: "AI 辨識失敗",
        detail: body.error && body.error.message ? body.error.message : "Gemini API error"
      });
    }

    const rawText = (((body.candidates || [])[0] || {}).content || {}).parts || [];
    const text = rawText.map((part) => part.text || "").join("\n").trim();
    const parsed = extractJson(text);
    if (!parsed) {
      return res.status(502).json({ error: "AI 回傳格式無法解析", raw: text });
    }
    res.json(sanitizeResult(type, parsed, text));
  } catch (error) {
    res.status(500).json({ error: "伺服器錯誤", detail: error.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`賺大錢 running on http://localhost:${PORT}`);
});
