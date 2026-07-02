require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const app = express();
const unzipFile = promisify(execFile);
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
app.use(express.json({ limit: "28mb" }));
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
  },
  other_cost: {
    label: "其他車輛成本",
    fields: {
      cost_date: "成本日期",
      category: "成本類別，例如 etag、貨車貸款、保險、其他",
      amount: "金額，數字",
      odometer: "里程或公里數，數字，沒有則 0"
    },
    notes: [
      "這是車輛相關成本紀錄。",
      "只抓車輛使用成本，不要抓托運收入。"
    ]
  },
  reconciliation: {
    label: "月底客戶對帳單",
    fields: {
      statement_month: "對帳月份，優先輸出西元 YYYY-MM；若只有民國年月請換算，例如 115 年 6 月為 2026-06",
      customer_name: "客戶、公司、廠商或對帳單抬頭名稱",
      items: "對帳單每一列明細陣列，每列包含 date、order_no、vendor_name、route、weight、amount、note。看不到的欄位填空字串或 0",
      subtotal: "小計，數字",
      fuel_subsidy: "補貼油資，數字，沒有則 0",
      repayment_deduction: "扣借還款或其他扣款，負數，沒有則 0",
      total: "總計或應付金額，數字"
    },
    notes: [
      "這是客戶月底傳來用來核對的對帳單，可能是紙本照片、Excel 截圖或多頁圖片。",
      "重點是逐列抓出明細，不是只抓總金額。",
      "日期若使用民國年，請換算成西元日期；無法確認完整年月日才保留原字串。",
      "order_no 請保留單據號碼、流水號或運出單號；vendor_name 請保留廠商/客戶列名。",
      "補貼、扣款、總計要從表尾摘要抓出來，不要自行推算看不到的項目。"
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

function parseFileDataUrl(dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  return {
    mimeType: parsed.mimeType,
    buffer: Buffer.from(parsed.data, "base64")
  };
}

function parseImages(image, images) {
  const values = Array.isArray(images) && images.length ? images : [image];
  return values.map(parseDataUrl).filter(Boolean).slice(0, 4);
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

function sanitizeReconciliationResult(result, rawText) {
  const base = sanitizeResult("reconciliation", result, rawText);
  const sourceItems = Array.isArray(base.fields.items) ? base.fields.items : [];
  base.fields.items = sourceItems.slice(0, 300).map((item) => {
    const row = item && typeof item === "object" ? item : {};
    return {
      date: String(row.date ?? "").slice(0, 40),
      order_no: String(row.order_no ?? row.serial_no ?? "").slice(0, 80),
      vendor_name: String(row.vendor_name ?? row.customer_name ?? "").slice(0, 160),
      route: String(row.route ?? row.route_code ?? "").slice(0, 120),
      weight: row.weight === "" || row.weight == null ? "" : String(row.weight).slice(0, 80),
      amount: Number.isFinite(Number(row.amount)) ? Number(row.amount) : 0,
      note: String(row.note ?? "").slice(0, 500)
    };
  });
  for (const key of ["subtotal", "fuel_subsidy", "repayment_deduction", "total"]) {
    base.fields[key] = Number.isFinite(Number(base.fields[key])) ? Number(base.fields[key]) : 0;
  }
  base.fields.statement_month = String(base.fields.statement_month || "").slice(0, 20);
  base.fields.customer_name = String(base.fields.customer_name || "").slice(0, 160);
  return base;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function unzipEntry(file, entry) {
  const { stdout } = await unzipFile("unzip", ["-p", file, entry], { maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

function sharedStringsFromXml(xml) {
  return Array.from(String(xml || "").matchAll(/<si\b[\s\S]*?<\/si>/g)).map((match) => {
    return Array.from(match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map((part) => decodeXml(part[1]))
      .join("");
  });
}

function columnIndex(ref) {
  const letters = String(ref || "").match(/[A-Z]+/);
  if (!letters) return 0;
  return letters[0].split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function cellText(cellXml, sharedStrings) {
  const type = (cellXml.match(/\st="([^"]+)"/) || [])[1] || "";
  if (type === "inlineStr") {
    return Array.from(cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((part) => decodeXml(part[1])).join("");
  }
  const value = (cellXml.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
  if (value == null) return "";
  if (type === "s") return sharedStrings[Number(value)] || "";
  return decodeXml(value);
}

async function parseXlsxRows(buffer) {
  const tempFile = path.join(os.tmpdir(), `money-maker-import-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.xlsx`);
  await fs.writeFile(tempFile, buffer, { mode: 0o600 });
  try {
    let sharedStrings = [];
    try {
      sharedStrings = sharedStringsFromXml(await unzipEntry(tempFile, "xl/sharedStrings.xml"));
    } catch (_) {
      sharedStrings = [];
    }
    const sheetXml = await unzipEntry(tempFile, "xl/worksheets/sheet1.xml");
    return Array.from(sheetXml.matchAll(/<row\b[\s\S]*?<\/row>/g)).map((rowMatch) => {
      const row = [];
      for (const cellMatch of rowMatch[0].matchAll(/<c\b[\s\S]*?<\/c>/g)) {
        const cellXml = cellMatch[0];
        const ref = (cellXml.match(/\sr="([^"]+)"/) || [])[1] || "";
        row[columnIndex(ref)] = cellText(cellXml, sharedStrings);
      }
      return row.map((value) => String(value || "").trim());
    }).filter((row) => row.some(Boolean));
  } finally {
    await fs.rm(tempFile, { force: true });
  }
}

function normalizeImportDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return text;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function parseLiters(title) {
  const match = String(title || "").match(/(\d+(?:\.\d+)?)\s*公升/);
  return match ? Number(match[1]) : 0;
}

function classifyCostTitle(title) {
  const text = String(title || "");
  if (/公升|柴油|汽油|無鉛/.test(text)) return "fuel";
  if (/保養|輪胎|煞車|引擎|變速箱|電瓶|破胎|ABS|abs|輪軸/.test(text)) return "maintenance";
  return "other_cost";
}

function spreadsheetRowsToRecords(rows) {
  const headers = rows[0] || [];
  const indexOf = (...names) => headers.findIndex((header) => names.includes(String(header).trim()));
  const dateIndex = indexOf("日期", "時間");
  const odometerIndex = indexOf("公里", "里程");
  const amountIndex = indexOf("總額", "金額", "費用");
  const titleIndex = indexOf("標題", "項目", "品項");
  const noteIndex = indexOf("備註", "說明");
  if (dateIndex < 0 || amountIndex < 0 || titleIndex < 0) {
    return { records: [], skipped: Math.max(0, rows.length - 1), error: "Excel 欄位需包含日期、總額、標題" };
  }
  const records = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const date = normalizeImportDate(row[dateIndex]);
    const amount = Number(row[amountIndex] || 0);
    const title = String(row[titleIndex] || "").trim();
    const odometer = Number(row[odometerIndex] || 0);
    const note = String(row[noteIndex] || "").trim();
    if (!date || !title || !amount) {
      skipped += 1;
      continue;
    }
    const type = classifyCostTitle(title);
    if (type === "fuel") {
      records.push({
        type,
        fuel_date: date,
        liters: parseLiters(title),
        amount,
        odometer,
        fuel_type: title.replace(/^.*公升,?/, "").trim() || title,
        note
      });
    } else if (type === "maintenance") {
      records.push({
        type,
        service_date: date,
        plate_no: "",
        shop_name: "",
        items: title,
        labor_total: 0,
        parts_total: 0,
        tax: 0,
        total_due: amount,
        paid_status: "已收",
        odometer,
        note
      });
    } else {
      records.push({
        type,
        cost_date: date,
        category: title,
        amount,
        odometer,
        note
      });
    }
  }
  return { records, skipped };
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

app.post("/api/import-spreadsheet", async (req, res) => {
  try {
    const { file } = req.body || {};
    const parsed = parseFileDataUrl(file);
    if (!parsed) {
      return res.status(400).json({ error: "請上傳 Excel 檔案" });
    }
    const isExcel = /spreadsheet|excel|officedocument/i.test(parsed.mimeType);
    if (!isExcel) {
      return res.status(400).json({ error: "目前只支援 xlsx Excel 檔" });
    }
    const rows = await parseXlsxRows(parsed.buffer);
    const result = spreadsheetRowsToRecords(rows);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({
      ok: true,
      rows: Math.max(0, rows.length - 1),
      imported: result.records.length,
      skipped: result.skipped,
      records: result.records.slice(0, 1000)
    });
  } catch (error) {
    res.status(500).json({ error: "Excel 匯入失敗", detail: error.message });
  }
});

app.post("/api/ai-scan", async (req, res) => {
  try {
    const { type, image, images } = req.body || {};
    if (!scanTemplates[type]) {
      return res.status(400).json({ error: "不支援的掃描類型" });
    }
    const parsedImages = parseImages(image, images);
    if (!parsedImages.length) {
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
            ...parsedImages.map((parsedImage) => ({
              inlineData: { mimeType: parsedImage.mimeType, data: parsedImage.data }
            }))
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
    res.json(type === "reconciliation"
      ? sanitizeReconciliationResult(parsed, text)
      : sanitizeResult(type, parsed, text));
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
