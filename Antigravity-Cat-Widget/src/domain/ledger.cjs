const { readJson, writeJson } = require("../../../shared/storage.cjs");
const validCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
function localDate(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function parseValidDate(str) {
  if (typeof str !== "string") return null;
  const trimmed = str.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  const date = new Date(y, m - 1, d, 23, 59, 59, 999);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}
function makeRecord(step, sessionId, previous) {
  if (!Number.isSafeInteger(step?.step_index) || step.step_index < 0 || step.status !== "DONE") return null;
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > 256) return null;
  if (typeof step.created_at !== "string" || !step.created_at.trim()) return null;
  const date = new Date(step.created_at);
  if (!Number.isFinite(date.getTime())) return null;
  const tokens = {
    input: previous?.tokens.input ?? validCount(step.input_tokens),
    cache: previous?.tokens.cache ?? validCount(step.cache_read_tokens),
    output: previous?.tokens.output ?? validCount(step.output_tokens)
  };
  if (Object.values(tokens).every(value => value === null)) return null;
  tokens.total = Object.values(tokens).every(value => value !== null)
    ? tokens.input + tokens.cache + tokens.output : null;
  if (!Number.isSafeInteger(tokens.total)) tokens.total = null;
  return {
    id: sessionId + ":" + step.step_index, sessionId, stepIndex: step.step_index,
    timestamp: previous?.timestamp || date.toISOString(),
    date: localDate(previous ? new Date(previous.timestamp) : date),
    tokens, turnCost: null, status: "DONE", kind: "model-step", quality: "observed"
  };
}
class UsageLedger {
  constructor(options = {}) {
    this.storagePath = options.storagePath || null;
    this.now = options.now || (() => new Date());
    this.records = new Map();
    this._byDate = new Map();
    this._latest = null;
    this._indexDirty = true;
    this.quotaRemainingPercent = null;
    if (this.storagePath) {
      const stored = readJson(this.storagePath, { records: [] });
      for (const row of Array.isArray(stored.records) ? stored.records : []) {
        if (!row || typeof row !== "object") continue;
        const record = makeRecord({
          step_index: row.stepIndex, status: row.status, created_at: row.timestamp,
          input_tokens: row.tokens?.input, cache_read_tokens: row.tokens?.cache,
          output_tokens: row.tokens?.output
        }, row.sessionId);
        if (record && record.id === row.id) this.records.set(record.id, record);
      }
    }
  }
  recordStep(step, sessionId = step?.sessionId || "local") {
    const previous = this.records.get(sessionId + ":" + step?.step_index);
    const record = makeRecord(step, sessionId, previous);
    if (!record) return null;
    if (previous && JSON.stringify(previous.tokens) === JSON.stringify(record.tokens)) return null;
    this.records.set(record.id, record);
    this._indexDirty = true;
    // Fill late numeric metadata without another completion bubble or sound.
    return previous ? { ...record, updated: true } : record;
  }
  _ensureIndex() {
    if (!this._indexDirty) return;
    this._byDate.clear();
    let latest = null;
    for (const row of this.records.values()) {
      let bucket = this._byDate.get(row.date);
      if (!bucket) {
        bucket = [];
        this._byDate.set(row.date, bucket);
      }
      bucket.push(row);
      if (!latest || row.timestamp.localeCompare(latest.timestamp) > 0) latest = row;
    }
    this._latest = latest;
    this._indexDirty = false;
  }
  save() {
    if (!this.storagePath) return;
    const cutoff = this.now().getTime() - 90 * 86400000;
    writeJson(this.storagePath, {
      schemaVersion: 2,
      records: [...this.records.values()].filter(row => new Date(row.timestamp).getTime() >= cutoff)
    });
  }
  calculateTurnCost() { return null; }
  getQuotaStatus() {
    const value = this.quotaRemainingPercent;
    const known = typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
    return {
      display: known ? Math.round(value) + "%" : "—", value: known ? value : null,
      status: known ? (value <= 20 ? "critical" : "normal") : "unknown", isKnown: known,
      source: known ? "手动记录 · 非服务端" : "尚未读取真实额度",
      quality: known ? "manual" : "unknown", ariaValueNow: known ? value : null
    };
  }
  getSnapshot(multiDays = 7, multiEndDateStr = "") {
    this._ensureIndex();
    const date = localDate(this.now());
    const rows = this._byDate.get(date) || [];
    const sum = (items, key) => {
      if (!items.length || items.some(row => row.tokens[key] === null)) return null;
      const value = items.reduce((total, row) => total + row.tokens[key], 0);
      return Number.isSafeInteger(value) ? value : null;
    };
    const partial = rows.some(row => row.tokens.total === null);
    const latest = this._latest;

    const days = Number.isSafeInteger(Number(multiDays)) && Number(multiDays) >= 1 && Number(multiDays) <= 90 ? Number(multiDays) : 7;
    const endAnchor = parseValidDate(multiEndDateStr) || this.now();
    const endStr = localDate(endAnchor);
    const startDateObj = new Date(endAnchor.getFullYear(), endAnchor.getMonth(), endAnchor.getDate() - days + 1, 0, 0, 0, 0);
    const startStr = localDate(startDateObj);

    const multiRows = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(endAnchor.getFullYear(), endAnchor.getMonth(), endAnchor.getDate() - i);
      const bucket = this._byDate.get(localDate(d));
      if (bucket) multiRows.push(...bucket);
    }
    const multiDayPartial = multiRows.some(row => row.tokens.total === null);

    return {
      date, todayTokens: {
        prompt: sum(rows, "input"), cache: sum(rows, "cache"), output: sum(rows, "output"),
        total: sum(rows, "total")
      },
      todaySteps: rows.length, todayTurns: null, todayCost: null,
      multiDayTokens: {
        prompt: sum(multiRows, "input"), cache: sum(multiRows, "cache"), output: sum(multiRows, "output"),
        total: sum(multiRows, "total")
      },
      multiDaySteps: multiRows.length,
      multiDayPartial,
      multiDayRange: {
        start: startStr,
        end: endStr,
        days
      },
      quota: this.getQuotaStatus(), accountBalance: null, latest, partial, isDemoMode: false
    };
  }
  get todayTotalTokens() { return this.getSnapshot().todayTokens.total; }
}
module.exports = { UsageLedger, localDate, validCount, parseValidDate };
