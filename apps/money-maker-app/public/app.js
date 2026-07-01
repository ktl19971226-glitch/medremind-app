const STORAGE_KEY = "money-maker-records-v1";
const VAULT_KEY = "money-maker-private-vault-key-v1";
const DEFAULT_API_BASE = "https://yaojidecare.app/money-maker-api";

const TYPES = {
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
  }
};

const state = {
  type: "hotai",
  editingId: null,
  records: loadRecords(),
  search: "",
  syncing: false,
  syncQueued: false
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
    if (record.type !== state.type) return false;
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

function renderStats() {
  const month = todayMonthPrefix();
  let monthCost = 0;
  let monthExtra = 0;
  for (const record of activeRecords()) {
    const dateText = record.delivery_date || record.fuel_date || record.service_date || record.created_at || "";
    const inMonth = String(dateText).startsWith(month);
    if (!inMonth) continue;
    if (record.type === "fuel") monthCost += Number(record.amount || 0);
    if (record.type === "maintenance") monthCost += Number(record.total_due || record.labor_total || 0) + Number(record.parts_total || 0);
    if (record.type === "hotai") monthExtra += Number(record.extra_fee || 0);
  }
  $("#month-cost").textContent = money(monthCost);
  $("#month-extra").textContent = money(monthExtra);
  $("#total-count").textContent = String(activeRecords().length);
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

async function handleScan(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  setScanState("AI 辨識中...");
  try {
    const image = await fileToDataUrl(file);
    const apiBase = getApiBase();
    const response = await fetch(`${apiBase}/api/ai-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: state.type, image })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || result.detail || "AI 辨識失敗");
    }
    const fields = { ...result.fields };
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

renderForm();
renderAll();
initialSync();
