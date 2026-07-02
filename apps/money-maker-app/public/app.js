const STORAGE_KEY = "money-maker-records-v1";
const VAULT_KEY = "money-maker-private-vault-key-v1";
const DEFAULT_API_BASE = "https://yaojidecare.app/money-maker-api";

const TYPES = {
  auto: {
    title: "AI 自動分類",
    subtitle: "直接拍照或上傳檔案，AI 會判斷要放到和泰、泰中、油耗、保養或月底對帳。",
    labels: {},
    fields: [],
    primary: () => "AI 自動分類"
  },
  hotai: {
    title: "和泰托運紀錄",
    subtitle: "掃描或手動輸入配送日期、流水號、運送區間、附加費用。",
    labels: { delivery_date: "配送日期", serial_no: "流水號", route_code: "運送區間", extra_fee: "附加費用", note: "備註" },
    fields: [
      ["delivery_date", "datetime-local"],
      ["serial_no", "text"],
      ["route_code", "text"],
      ["extra_fee", "number"],
      ["note", "textarea"]
    ],
    primary: (r) => r.serial_no || r.delivery_date || "和泰紀錄"
  },
  taichung: {
    title: "泰中托運紀錄",
    subtitle: "廠商名稱抓左側「廠商：」欄位，不抓表頭公司名稱。",
    labels: { vendor_name: "廠商名稱", delivery_date: "送貨日期", order_no: "單號", note: "備註" },
    fields: [
      ["vendor_name", "text"],
      ["delivery_date", "text"],
      ["order_no", "text"],
      ["note", "textarea"]
    ],
    primary: (r) => r.order_no || r.vendor_name || "泰中紀錄"
  },
  fuel: {
    title: "油耗成本紀錄",
    subtitle: "記錄加油日期、公升數、金額、里程或公里數。",
    labels: { fuel_date: "加油日期", fuel_type: "油品", liters: "公升數", amount: "金額", odometer: "里程/公里數", note: "備註" },
    fields: [
      ["fuel_date", "date"],
      ["fuel_type", "text"],
      ["liters", "number"],
      ["amount", "number"],
      ["odometer", "number"],
      ["note", "textarea"]
    ],
    primary: (r) => `${r.fuel_date || "加油"} ${money(r.amount || 0)}`
  },
  maintenance: {
    title: "保養紀錄",
    subtitle: "記錄保養日期、車牌、店家、項目、工資、零件、稅金與應收合計。",
    labels: {
      service_date: "保養日期",
      plate_no: "車牌號碼",
      shop_name: "保修廠",
      items: "保養項目/耗材",
      labor_total: "工資",
      parts_total: "零件金額",
      tax: "稅金",
      total_due: "應收合計",
      paid_status: "收款狀態",
      note: "備註"
    },
    fields: [
      ["service_date", "date"],
      ["plate_no", "text"],
      ["shop_name", "text"],
      ["items", "textarea"],
      ["labor_total", "number"],
      ["parts_total", "number"],
      ["tax", "number"],
      ["total_due", "number"],
      ["paid_status", "select", ["", "已收", "未收"]],
      ["note", "textarea"]
    ],
    primary: (r) => `${r.service_date || "保養"} ${r.shop_name || ""}`.trim()
  },
  reconciliation: {
    title: "月底 AI 對帳",
    subtitle: "上傳客戶月底對帳單，AI 會讀出明細並和 App 內托運紀錄核對缺漏。",
    labels: {
      statement_month: "對帳月份",
      customer_name: "客戶",
      items: "對帳明細",
      subtotal: "小計",
      fuel_subsidy: "補貼油資",
      repayment_deduction: "扣借還款",
      total: "總計",
      note: "備註"
    },
    fields: [
      ["statement_month", "text"],
      ["customer_name", "text"],
      ["subtotal", "number"],
      ["fuel_subsidy", "number"],
      ["repayment_deduction", "number"],
      ["total", "number"],
      ["note", "textarea"]
    ],
    primary: (r) => `${r.statement_month || "月底"} 對帳 ${r.customer_name || ""}`.trim()
  }
};

const state = {
  type: "hotai",
  editingId: null,
  records: loadRecords(),
  search: "",
  syncing: false,
  syncQueued: false,
  reconciliation: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function saveRecords(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
  if (options.sync !== false) {
    queueSync();
  }
}

function generateVaultKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getVaultKey() {
  let key = localStorage.getItem(VAULT_KEY);
  if (!key) {
    key = generateVaultKey();
    localStorage.setItem(VAULT_KEY, key);
  }
  return key;
}

function setSyncState(text, error = false) {
  const el = $("#sync-state");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("error", error);
}

function activeRecords(records = state.records) {
  return records.filter((record) => !record.deleted_at);
}

function recordTimestamp(record) {
  const time = Date.parse(record && (record.updated_at || record.created_at || record.deleted_at));
  return Number.isFinite(time) ? time : 0;
}

function mergeRecords(localRecords, remoteRecords) {
  const map = new Map();
  for (const record of [...remoteRecords, ...localRecords]) {
    if (!record || !record.id) continue;
    const existing = map.get(record.id);
    if (!existing || recordTimestamp(record) >= recordTimestamp(existing)) {
      map.set(record.id, record);
    }
  }
  return Array.from(map.values()).sort((a, b) => recordTimestamp(b) - recordTimestamp(a));
}

async function syncRequest(path, method, body) {
  const response = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || result.detail || "同步失敗");
  }
  return result;
}

async function pullRemoteRecords() {
  const result = await syncRequest("/api/private-sync/pull", "POST", {
    vault_key: getVaultKey()
  });
  return Array.isArray(result.records) ? result.records : [];
}

async function pushRecords() {
  return syncRequest("/api/private-sync/push", "PUT", {
    vault_key: getVaultKey(),
    records: state.records
  });
}

async function initialSync() {
  setSyncState("私有同步中");
  try {
    const remoteRecords = await pullRemoteRecords();
    state.records = mergeRecords(state.records, remoteRecords);
    saveRecords({ sync: false });
    renderAll();
    await pushRecords();
    setSyncState("已私有同步");
  } catch (error) {
    setSyncState("同步稍後重試", true);
    setTimeout(queueSync, 5000);
  }
}

function queueSync() {
  if (state.syncing) {
    state.syncQueued = true;
    return;
  }
  state.syncing = true;
  state.syncQueued = false;
  setSyncState("私有同步中");
  setTimeout(async () => {
    try {
      await pushRecords();
      setSyncState("已私有同步");
    } catch (error) {
      setSyncState("同步稍後重試", true);
    } finally {
      state.syncing = false;
      if (state.syncQueued) {
        queueSync();
      }
    }
  }, 250);
}

function money(value) {
  const number = Number(value || 0);
  return number.toLocaleString("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });
}

function todayMonthPrefix() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeAiDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return text;
  const [, y, m, d, hh = "00", mm = "00"] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${hh.padStart(2, "0")}:${mm}`;
}

function currentType() {
  return TYPES[state.type];
}

function renderForm(values = {}) {
  const type = currentType();
  $("#form-title").textContent = type.title;
  $("#form-subtitle").textContent = type.subtitle;

  if (state.type === "reconciliation") {
    $("#entry-form").innerHTML = renderReconciliationPanel();
    return;
  }
  if (state.type === "auto") {
    $("#entry-form").innerHTML = `
      <div class="recon-empty">
        <strong>自動分類模式</strong>
        <p>拍照或上傳圖片時，AI 會先判斷單據類型，再把資料填入對應分類。Excel 檔會直接自動匯入油耗與保養。</p>
      </div>
    `;
    return;
  }

  const fields = type.fields.map(([key, inputType, options]) => {
    const label = type.labels[key] || key;
    const value = values[key] ?? "";
    const full = inputType === "textarea" || key === "items" || key === "note";
    if (inputType === "textarea") {
      return `<label class="field ${full ? "full" : ""}"><span>${label}</span><textarea name="${key}">${escapeHtml(formatValueForInput(value))}</textarea></label>`;
    }
    if (inputType === "select") {
      const optionHtml = (options || []).map((item) => `<option value="${escapeHtml(item)}" ${String(value) === item ? "selected" : ""}>${item || "未設定"}</option>`).join("");
      return `<label class="field"><span>${label}</span><select name="${key}">${optionHtml}</select></label>`;
    }
    return `<label class="field"><span>${label}</span><input name="${key}" type="${inputType}" value="${escapeHtml(formatValueForInput(value))}" ${inputType === "number" ? "inputmode=\"decimal\"" : ""}></label>`;
  }).join("");

  $("#entry-form").innerHTML = `
    <div class="field-grid">${fields}</div>
    <div class="form-actions">
      <button type="submit">${state.editingId ? "更新紀錄" : "儲存紀錄"}</button>
      <button class="secondary-button" id="reset-form" type="button">清空</button>
    </div>
  `;
}

function formatValueForInput(value) {
  if (Array.isArray(value)) return value.join("\n");
  return String(value ?? "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formValues() {
  const data = new FormData($("#entry-form"));
  const values = {};
  for (const [key, value] of data.entries()) {
    values[key] = typeof value === "string" ? value.trim() : value;
  }
  return values;
}

function saveForm(event) {
  event.preventDefault();
  const values = formValues();
  const now = new Date().toISOString();
  if (state.editingId) {
    state.records = state.records.map((record) => record.id === state.editingId ? { ...record, ...values, updated_at: now } : record);
  } else {
    state.records.unshift({ id: crypto.randomUUID(), type: state.type, ...values, created_at: now, updated_at: now });
  }
  state.editingId = null;
  saveRecords();
  renderForm();
  renderAll();
  setScanState("已儲存，正在同步。");
}

function setMode(type) {
  state.type = type;
  state.editingId = null;
  $$(".mode-card").forEach((button) => button.classList.toggle("active", button.dataset.type === type));
  resetScanInputs();
  setScanState("");
  renderForm();
  renderAll();
}

function filteredRecords() {
  const term = state.search.trim().toLowerCase();
  return activeRecords().filter((record) => {
    if (state.type !== "auto" && record.type !== state.type) return false;
    if (!term) return true;
    return JSON.stringify(record).toLowerCase().includes(term);
  });
}

function renderRecords() {
  const list = $("#record-list");
  const records = filteredRecords();
  if (!records.length) {
    list.innerHTML = `<div class="empty-state">目前沒有${currentType().title}。</div>`;
    return;
  }

  const template = $("#record-template");
  list.innerHTML = "";
  for (const record of records) {
    const node = template.content.firstElementChild.cloneNode(true);
    const type = TYPES[record.type];
    node.dataset.id = record.id;
    node.querySelector(".record-type").textContent = type.title;
    node.querySelector("h3").textContent = type.primary(record);
    const dl = node.querySelector("dl");
    for (const [key] of type.fields) {
      if (key === "note" && !record[key]) continue;
      const dt = document.createElement("dt");
      dt.textContent = type.labels[key] || key;
      const dd = document.createElement("dd");
      dd.textContent = formatDisplayValue(record[key]);
      dl.append(dt, dd);
    }
    list.append(node);
  }
}

function formatDisplayValue(value) {
  if (Array.isArray(value)) return value.join("、");
  return String(value || "-");
}

function normalizeMatchText(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function recordDateText(record) {
  return String(record.delivery_date || record.fuel_date || record.service_date || record.created_at || "");
}

function normalizeStatementMonth(value) {
  const text = String(value || "").trim();
  const western = text.match(/(20\d{2})[年/.-]?\s*(\d{1,2})/);
  if (western) return `${western[1]}-${western[2].padStart(2, "0")}`;
  const roc = text.match(/(\d{2,3})\s*[年/.-]\s*(\d{1,2})/);
  if (roc) return `${Number(roc[1]) + 1911}-${roc[2].padStart(2, "0")}`;
  return text.slice(0, 7);
}

function normalizeStatementDate(value, statementMonth = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const western = text.match(/(20\d{2})[年/.-]\s*(\d{1,2})[月/.-]\s*(\d{1,2})/);
  if (western) return `${western[1]}-${western[2].padStart(2, "0")}-${western[3].padStart(2, "0")}`;
  const roc = text.match(/(\d{2,3})[年/.-]\s*(\d{1,2})[月/.-]\s*(\d{1,2})/);
  if (roc) return `${Number(roc[1]) + 1911}-${roc[2].padStart(2, "0")}-${roc[3].padStart(2, "0")}`;
  const monthDay = text.match(/^(\d{1,2})[月/.-]\s*(\d{1,2})/);
  if (monthDay && /^\d{4}-\d{2}$/.test(statementMonth)) {
    return `${statementMonth.slice(0, 4)}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`;
  }
  const dayOnly = text.match(/^(\d{1,2})$/);
  if (dayOnly && /^\d{4}-\d{2}$/.test(statementMonth)) {
    return `${statementMonth}-${dayOnly[1].padStart(2, "0")}`;
  }
  return text;
}

function deliveryRecordsForMonth(statementMonth) {
  return activeRecords().filter((record) => {
    if (!["hotai", "taichung"].includes(record.type)) return false;
    if (!statementMonth) return true;
    return recordDateText(record).startsWith(statementMonth);
  });
}

function statementRowKey(row, statementMonth = "") {
  const orderNo = normalizeMatchText(row.order_no);
  if (orderNo) return `order:${orderNo}`;
  const date = normalizeStatementDate(row.date, statementMonth);
  return `fallback:${normalizeMatchText(date)}:${normalizeMatchText(row.vendor_name)}:${normalizeMatchText(row.route)}`;
}

function appRecordKey(record) {
  const orderNo = normalizeMatchText(record.order_no || record.serial_no);
  if (orderNo) return `order:${orderNo}`;
  return `fallback:${normalizeMatchText(recordDateText(record).slice(0, 10))}:${normalizeMatchText(record.vendor_name)}:${normalizeMatchText(record.route_code)}`;
}

function compareReconciliation(fields) {
  const statementMonth = normalizeStatementMonth(fields.statement_month);
  const statementRows = (Array.isArray(fields.items) ? fields.items : []).map((row, index) => ({
    index,
    date: normalizeStatementDate(row.date, statementMonth),
    order_no: String(row.order_no || "").trim(),
    vendor_name: String(row.vendor_name || "").trim(),
    route: String(row.route || "").trim(),
    weight: row.weight ?? "",
    amount: Number(row.amount || 0),
    note: String(row.note || "").trim()
  }));
  const appRows = deliveryRecordsForMonth(statementMonth);
  const appByKey = new Map();
  for (const record of appRows) {
    const key = appRecordKey(record);
    if (!appByKey.has(key)) appByKey.set(key, []);
    appByKey.get(key).push(record);
  }

  const matchedAppIds = new Set();
  const matchedRows = [];
  const duplicates = [];
  const amountMismatches = [];
  const statementKeyCounts = new Map();

  for (const row of statementRows) {
    const key = statementRowKey(row, statementMonth);
    statementKeyCounts.set(key, (statementKeyCounts.get(key) || 0) + 1);
    const matches = appByKey.get(key) || [];
    if (matches.length) {
      const appRecord = matches[0];
      matchedAppIds.add(appRecord.id);
      matchedRows.push({ row, record: appRecord });
      const appAmount = Number(appRecord.amount || appRecord.total_due || appRecord.extra_fee || 0);
      if (row.amount && appAmount && Math.abs(row.amount - appAmount) > 1) {
        amountMismatches.push({ row, record: appRecord, appAmount });
      }
    }
  }

  for (const [key, count] of statementKeyCounts.entries()) {
    if (count > 1 && key !== "fallback:::") duplicates.push({ key, count });
  }

  return {
    fields,
    statementMonth,
    statementRows,
    appRows,
    matchedRows,
    missingInApp: statementRows.filter((row) => !(appByKey.get(statementRowKey(row, statementMonth)) || []).length),
    missingInStatement: appRows.filter((record) => !matchedAppIds.has(record.id)),
    amountMismatches,
    duplicates,
    calculatedTotal: Number(fields.subtotal || 0) + Number(fields.fuel_subsidy || 0) + Number(fields.repayment_deduction || 0)
  };
}

function rowTitle(row) {
  return [row.date, row.order_no, row.vendor_name || row.route].filter(Boolean).join(" / ") || "未命名明細";
}

function renderIssueList(title, rows, formatter) {
  const items = rows.length
    ? rows.map((row) => `<li>${escapeHtml(formatter(row))}</li>`).join("")
    : `<li class="ok-item">沒有發現</li>`;
  return `<section class="recon-issue"><h3>${title}</h3><ul>${items}</ul></section>`;
}

function renderReconciliationPanel() {
  const report = state.reconciliation;
  if (!report) {
    return `
      <div class="recon-empty">
        <strong>上傳客戶月底對帳單後，AI 會自動核對。</strong>
        <p>支援一張或多張照片，會抓日期、單號、廠商、重量、金額、小計、補貼、扣款與總計，再跟 App 裡的和泰/泰中托運紀錄比對。</p>
      </div>
    `;
  }
  const totalDiff = Number(report.fields.total || 0) - report.calculatedTotal;
  return `
    <div class="recon-summary">
      <div><span>對帳月份</span><strong>${escapeHtml(report.statementMonth || "-")}</strong></div>
      <div><span>對帳單明細</span><strong>${report.statementRows.length}</strong></div>
      <div><span>App 托運紀錄</span><strong>${report.appRows.length}</strong></div>
      <div><span>已配對</span><strong>${report.matchedRows.length}</strong></div>
    </div>
    <div class="recon-totals">
      <span>小計 ${money(report.fields.subtotal)}</span>
      <span>補貼 ${money(report.fields.fuel_subsidy)}</span>
      <span>扣款 ${money(report.fields.repayment_deduction)}</span>
      <span>總計 ${money(report.fields.total)}</span>
      <span class="${Math.abs(totalDiff) > 1 ? "danger-text" : "ok-text"}">表尾差額 ${money(totalDiff)}</span>
    </div>
    <div class="recon-grid">
      ${renderIssueList("對帳單有，App 沒有", report.missingInApp, rowTitle)}
      ${renderIssueList("App 有，對帳單沒有", report.missingInStatement, (record) => `${TYPES[record.type].title} / ${TYPES[record.type].primary(record)}`)}
      ${renderIssueList("金額不一致", report.amountMismatches, (item) => `${rowTitle(item.row)}：對帳單 ${money(item.row.amount)} / App ${money(item.appAmount)}`)}
      ${renderIssueList("重複單號", report.duplicates, (item) => `${item.key.replace(/^order:/, "")} 重複 ${item.count} 次`)}
    </div>
    <div class="form-actions">
      <button type="button" id="save-reconciliation">儲存這次核對結果</button>
      <button class="secondary-button" id="clear-reconciliation" type="button">清除</button>
    </div>
  `;
}

function maintenanceAmount(record) {
  return Number(record.total_due || 0) || (Number(record.labor_total || 0) + Number(record.parts_total || 0) + Number(record.tax || 0));
}

function recordMonth(record) {
  const value = record.statement_month || record.delivery_date || record.fuel_date || record.service_date || record.created_at || "";
  return String(value).slice(0, 7);
}

function monthlyRecords(month) {
  return activeRecords().filter((record) => recordMonth(record) === month);
}

function deliveryKey(record) {
  if (!["hotai", "taichung"].includes(record.type)) return "";
  return normalizeMatchText(record.serial_no || record.order_no);
}

function latestReconciliation(month) {
  return activeRecords()
    .filter((record) => record.type === "reconciliation" && String(record.statement_month || "").slice(0, 7) === month)
    .sort((a, b) => recordTimestamp(b) - recordTimestamp(a))[0] || null;
}

function buildMonthlyReport(month = todayMonthPrefix()) {
  const records = monthlyRecords(month);
  const fuelRecords = records.filter((record) => record.type === "fuel");
  const maintenanceRecords = records.filter((record) => record.type === "maintenance");
  const hotaiRecords = records.filter((record) => record.type === "hotai");
  const taichungRecords = records.filter((record) => record.type === "taichung");
  const reconciliationRecords = records.filter((record) => record.type === "reconciliation");
  const fuelCost = fuelRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const maintenanceCost = maintenanceRecords.reduce((sum, record) => sum + maintenanceAmount(record), 0);
  const reconciliationIncome = reconciliationRecords.reduce((sum, record) => sum + Number(record.total || 0), 0);
  const extraIncome = hotaiRecords.reduce((sum, record) => sum + Number(record.extra_fee || 0), 0);
  const income = reconciliationIncome + extraIncome;
  const cost = fuelCost + maintenanceCost;
  const alerts = buildAlerts(month, records);
  const fuelOdometers = fuelRecords.map((record) => Number(record.odometer || 0)).filter(Boolean).sort((a, b) => a - b);
  const kilometers = fuelOdometers.length >= 2 ? fuelOdometers[fuelOdometers.length - 1] - fuelOdometers[0] : 0;
  const liters = fuelRecords.reduce((sum, record) => sum + Number(record.liters || 0), 0);
  return {
    month,
    records,
    fuelRecords,
    maintenanceRecords,
    hotaiRecords,
    taichungRecords,
    reconciliationRecords,
    income,
    reconciliationIncome,
    extraIncome,
    cost,
    fuelCost,
    maintenanceCost,
    profit: income - cost,
    alerts,
    kilometers,
    liters
  };
}

function buildAlerts(month, records) {
  const alerts = [];
  const seen = new Map();
  for (const record of records) {
    const key = deliveryKey(record);
    if (!key) continue;
    if (seen.has(key)) alerts.push(`重複單號：${key}`);
    seen.set(key, record);
  }

  const report = latestReconciliation(month);
  if (report && Array.isArray(report.items)) {
    const comparison = compareReconciliation({
      statement_month: report.statement_month,
      customer_name: report.customer_name,
      items: report.items,
      subtotal: report.subtotal,
      fuel_subsidy: report.fuel_subsidy,
      repayment_deduction: report.repayment_deduction,
      total: report.total
    });
    if (comparison.missingInApp.length) alerts.push(`對帳單有、App 沒有：${comparison.missingInApp.length} 筆`);
    if (comparison.missingInStatement.length) alerts.push(`App 有、對帳單沒有：${comparison.missingInStatement.length} 筆`);
    if (comparison.amountMismatches.length) alerts.push(`金額不一致：${comparison.amountMismatches.length} 筆`);
    if (comparison.duplicates.length) alerts.push(`對帳單重複單號：${comparison.duplicates.length} 組`);
    const totalDiff = Number(report.total || 0) - comparison.calculatedTotal;
    if (Math.abs(totalDiff) > 1) alerts.push(`對帳表尾差額：${money(totalDiff)}`);
  }
  return alerts;
}

function renderMetricRows(container, rows) {
  container.innerHTML = rows.map(([label, value]) => `
    <div class="metric-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("");
}

function renderStats() {
  const report = buildMonthlyReport();
  $("#month-profit").textContent = money(report.profit);
  $("#month-income").textContent = money(report.income);
  $("#month-cost").textContent = money(report.cost);
  $("#month-fuel").textContent = money(report.fuelCost);
  $("#month-maintenance").textContent = money(report.maintenanceCost);
  $("#issue-count").textContent = String(report.alerts.length);
  $("#total-count").textContent = String(activeRecords().length);
  $("#profit-note").textContent = `收入 ${money(report.income)} - 成本 ${money(report.cost)}`;

  renderMetricRows($("#source-stats"), [
    ["對帳收入", money(report.reconciliationIncome)],
    ["和泰附加費", money(report.extraIncome)],
    ["和泰筆數", `${report.hotaiRecords.length} 筆`],
    ["泰中筆數", `${report.taichungRecords.length} 筆`],
    ["對帳報告", `${report.reconciliationRecords.length} 份`]
  ]);

  const alertList = $("#alert-list");
  alertList.innerHTML = report.alerts.length
    ? report.alerts.slice(0, 8).map((alert) => `<li>${escapeHtml(alert)}</li>`).join("")
    : `<li class="ok-alert">目前沒有缺漏或重複提醒</li>`;

  const kmText = report.kilometers ? `${report.kilometers.toLocaleString("zh-TW")} 公里` : "資料不足";
  const costPerKm = report.kilometers ? money(report.fuelCost / report.kilometers) : "-";
  renderMetricRows($("#cost-trends"), [
    ["本月加油", `${report.fuelRecords.length} 筆 / ${report.liters.toLocaleString("zh-TW", { maximumFractionDigits: 2 })} 公升`],
    ["里程區間", kmText],
    ["油錢/公里", costPerKm],
    ["保養維修", `${report.maintenanceRecords.length} 筆 / ${money(report.maintenanceCost)}`]
  ]);
}

function renderAll() {
  renderStats();
  renderRecords();
}

function setScanState(text, error = false) {
  const el = $("#scan-state");
  el.textContent = text;
  el.classList.toggle("error", error);
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function isSpreadsheetFile(file) {
  return /\.xlsx$/i.test(file.name || "") || /spreadsheet|excel|officedocument/i.test(file.type || "");
}

async function handleSpreadsheetImport(file) {
  setScanState("Excel 讀取中...");
  const dataUrl = await fileToDataUrl(file);
  const response = await fetch(`${getApiBase()}/api/import-spreadsheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: dataUrl })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || result.detail || "Excel 匯入失敗");
  }
  const now = new Date().toISOString();
  const records = (result.records || []).map((record) => ({
    id: crypto.randomUUID(),
    ...record,
    created_at: now,
    updated_at: now
  }));
  if (!records.length) {
    setScanState("Excel 沒有可匯入的資料。", true);
    return;
  }
  const fuelCount = records.filter((record) => record.type === "fuel").length;
  const maintenanceCount = records.filter((record) => record.type === "maintenance").length;
  const summary = `讀到 ${records.length} 筆：油耗 ${fuelCount}、保養 ${maintenanceCount}。`;
  if (!confirm(`${summary}\n要匯入 App 並同步嗎？`)) {
    setScanState("已取消 Excel 匯入。");
    return;
  }
  state.records = [...records, ...state.records];
  state.type = fuelCount ? "fuel" : "maintenance";
  $$(".mode-card").forEach((button) => button.classList.toggle("active", button.dataset.type === state.type));
  saveRecords();
  renderForm();
  renderAll();
  setScanState(`${summary} 已匯入並同步。`);
}

async function handleScan(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  setScanState("AI 辨識中...");
  try {
    if (isSpreadsheetFile(files[0])) {
      await handleSpreadsheetImport(files[0]);
      return;
    }
    const images = await Promise.all(files.slice(0, state.type === "reconciliation" ? 4 : 1).map(fileToDataUrl));
    const apiBase = getApiBase();
    const response = await fetch(`${apiBase}/api/ai-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: state.type, image: images[0], images })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || result.detail || "AI 辨識失敗");
    }
    const detectedType = result.type && TYPES[result.type] && result.type !== "auto" ? result.type : state.type;
    const fields = { ...result.fields };
    if (detectedType === "reconciliation") {
      state.type = "reconciliation";
      $$(".mode-card").forEach((button) => button.classList.toggle("active", button.dataset.type === state.type));
      state.reconciliation = compareReconciliation(fields);
      renderForm();
      const issueCount = state.reconciliation.missingInApp.length
        + state.reconciliation.missingInStatement.length
        + state.reconciliation.amountMismatches.length
        + state.reconciliation.duplicates.length;
      setScanState(issueCount ? `核對完成，發現 ${issueCount} 個需要確認的項目。` : "核對完成，沒有發現缺漏。");
      renderRecords();
      return;
    }
    if (detectedType !== state.type) {
      state.type = detectedType;
      $$(".mode-card").forEach((button) => button.classList.toggle("active", button.dataset.type === state.type));
    }
    if (state.type === "hotai" && fields.delivery_date) {
      fields.delivery_date = normalizeAiDate(fields.delivery_date);
    }
    if (Array.isArray(fields.items)) {
      fields.items = fields.items.join("\n");
    }
    renderForm(fields);
    const lowConfidence = Object.entries(result.confidence || {})
      .filter(([, score]) => Number(score) > 0 && Number(score) < 0.7)
      .map(([key]) => currentType().labels[key] || key);
    const message = lowConfidence.length
      ? `已填入，請特別確認：${lowConfidence.join("、")}`
      : "已填入表單，請確認後儲存。";
    setScanState(message);
  } catch (error) {
    setScanState(error.message, true);
  } finally {
    event.target.value = "";
  }
}

function getApiBase() {
  if (location.protocol === "capacitor:") {
    return DEFAULT_API_BASE;
  }
  return location.origin;
}

function resetScanInputs() {
  $("#scan-camera").value = "";
  $("#scan-upload").value = "";
}

function editRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  state.type = record.type;
  state.editingId = id;
  $$(".mode-card").forEach((button) => button.classList.toggle("active", button.dataset.type === record.type));
  renderForm(record);
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteRecord(id) {
  if (!confirm("確定刪除這筆紀錄？")) return;
  const now = new Date().toISOString();
  state.records = state.records.map((record) => record.id === id ? { ...record, deleted_at: now, updated_at: now } : record);
  saveRecords();
  renderAll();
}

function exportCsv() {
  const headers = ["type", "id", "created_at", "updated_at", "data"];
  const rows = activeRecords().map((record) => [
    record.type,
    record.id,
    record.created_at,
    record.updated_at,
    JSON.stringify(record)
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `賺大錢紀錄-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportMonthlyReport() {
  const report = buildMonthlyReport();
  const rows = [
    ["區塊", "項目", "金額/數量"],
    ["損益", "收入", report.income],
    ["損益", "成本", report.cost],
    ["損益", "淨利", report.profit],
    ["成本", "油耗", report.fuelCost],
    ["成本", "保養", report.maintenanceCost],
    ["來源", "和泰筆數", report.hotaiRecords.length],
    ["來源", "泰中筆數", report.taichungRecords.length],
    ["來源", "對帳報告", report.reconciliationRecords.length],
    ["趨勢", "公升數", report.liters],
    ["趨勢", "里程區間", report.kilometers],
    ["提醒", "待確認", report.alerts.length],
    ...report.alerts.map((alert) => ["提醒", alert, ""]),
    ["", "", ""],
    ["type", "date/month", "title", "amount", "raw"],
    ...report.records.map((record) => [
      record.type,
      recordMonth(record),
      TYPES[record.type] ? TYPES[record.type].primary(record) : record.id,
      record.amount || record.total_due || record.total || record.extra_fee || "",
      JSON.stringify(record)
    ])
  ];
  downloadCsv(`賺大錢月報-${report.month}.csv`, rows);
}

document.addEventListener("click", (event) => {
  const modeButton = event.target.closest(".mode-card");
  if (modeButton) setMode(modeButton.dataset.type);

  const editButton = event.target.closest(".edit-record");
  if (editButton) editRecord(editButton.closest(".record-card").dataset.id);

  const deleteButton = event.target.closest(".delete-record");
  if (deleteButton) deleteRecord(deleteButton.closest(".record-card").dataset.id);

  if (event.target.id === "reset-form") {
    state.editingId = null;
    renderForm();
    resetScanInputs();
    setScanState("");
  }

  if (event.target.id === "clear-reconciliation") {
    state.reconciliation = null;
    renderForm();
    resetScanInputs();
    setScanState("");
  }

  if (event.target.id === "save-reconciliation" && state.reconciliation) {
    const now = new Date().toISOString();
    const report = state.reconciliation;
    state.records.unshift({
      id: crypto.randomUUID(),
      type: "reconciliation",
      statement_month: report.statementMonth,
      customer_name: report.fields.customer_name || "",
      subtotal: report.fields.subtotal || 0,
      fuel_subsidy: report.fields.fuel_subsidy || 0,
      repayment_deduction: report.fields.repayment_deduction || 0,
      total: report.fields.total || 0,
      note: `對帳單 ${report.statementRows.length} 筆，App ${report.appRows.length} 筆，缺 App ${report.missingInApp.length} 筆，缺對帳單 ${report.missingInStatement.length} 筆，金額不符 ${report.amountMismatches.length} 筆，重複 ${report.duplicates.length} 筆。`,
      items: report.statementRows,
      created_at: now,
      updated_at: now
    });
    saveRecords();
    renderAll();
    setScanState("核對結果已儲存，正在同步。");
  }
});

$("#entry-form").addEventListener("submit", saveForm);
$("#scan-camera").addEventListener("change", handleScan);
$("#scan-upload").addEventListener("change", handleScan);
$("#search-input").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderRecords();
});
$("#clear-filter").addEventListener("click", () => {
  state.search = "";
  $("#search-input").value = "";
  renderRecords();
});
$("#export-btn").addEventListener("click", exportCsv);
$("#export-monthly-btn").addEventListener("click", exportMonthlyReport);

renderForm();
renderAll();
initialSync();
