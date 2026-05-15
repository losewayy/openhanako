/**
 * Token Usage 存储 + API
 *
 * 事件来源: hub.eventBus 的 token_usage 事件（在 chat.js turn_end 时发射）
 * 存储策略: 内存 Map（按日期聚合）+ JSON 文件持久化
 * API 格式: GET /api/token-usage?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 */
import { Hono } from "hono";
import fs from "fs";
import path from "path";

const STORE_FILE = "token-usage.json";

/**
 * TokenUsageStore
 *
 * 内存结构:
 * {
 *   "YYYY-MM-DD": {
 *     "provider:model": {
 *       provider_id, model, prompt_tokens, completion_tokens, call_count
 *     }
 *   }
 * }
 */
export class TokenUsageStore {
  #data = {};         // date -> modelKey -> aggregated record
  #persistPath = null;
  #writeTimer = null;

  constructor(persistDir) {
    if (persistDir) {
      this.#persistPath = path.join(persistDir, STORE_FILE);
      this.#load();
    }
  }

  #load() {
    if (!this.#persistPath) return;
    try {
      const raw = fs.readFileSync(this.#persistPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        this.#data = parsed;
      }
    } catch {
      this.#data = {};
    }
  }

  #schedulePersist() {
    if (this.#writeTimer) return;
    this.#writeTimer = setTimeout(() => {
      this.#writeTimer = null;
      this.#persist();
    }, 5000);
  }

  #persist() {
    if (!this.#persistPath) return;
    try {
      const dir = path.dirname(this.#persistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.#persistPath, JSON.stringify(this.#data), "utf-8");
    } catch (err) {
      console.error("[token-usage] persist failed:", err.message);
    }
  }

  record({ date, provider_id, model, prompt_tokens = 0, completion_tokens = 0, call_count = 1 }) {
    if (!date || !model) return;

    if (!this.#data[date]) this.#data[date] = {};
    const key = `${provider_id || ""}:${model}`;

    if (!this.#data[date][key]) {
      this.#data[date][key] = {
        provider_id: provider_id || "",
        model,
        prompt_tokens: 0,
        completion_tokens: 0,
        call_count: 0,
      };
    }

    const entry = this.#data[date][key];
    entry.prompt_tokens += prompt_tokens;
    entry.completion_tokens += completion_tokens;
    entry.call_count += call_count;

    this.#schedulePersist();
  }

  query(startDate, endDate) {
    const records = [];
    const dates = Object.keys(this.#data).sort();

    for (const date of dates) {
      if (date < startDate || date > endDate) continue;
      const models = this.#data[date];
      for (const key of Object.keys(models)) {
        const entry = models[key];
        records.push({
          date,
          provider_id: entry.provider_id,
          model: entry.model,
          prompt_tokens: entry.prompt_tokens,
          completion_tokens: entry.completion_tokens,
          call_count: entry.call_count,
        });
      }
    }

    return records;
  }

  destroy() {
    if (this.#writeTimer) {
      clearTimeout(this.#writeTimer);
      this.#writeTimer = null;
    }
    this.#persist();
  }
}

function parseDate(str, fallback) {
  if (!str) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return fallback;
  return str;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function createTokenUsageRoute(store) {
  const router = new Hono();

  router.get("/token-usage", async (c) => {
    const startDate = parseDate(c.req.query("start_date"), thirtyDaysAgo());
    const endDate = parseDate(c.req.query("end_date"), todayStr());
    const records = store.query(startDate, endDate);
    return c.json({ records });
  });

  return router;
}

export function initTokenUsageStore(hub, persistDir) {
  const store = new TokenUsageStore(persistDir);

  hub.subscribe((event) => {
    if (event.type !== "token_usage") return;
    const { usage, modelId, modelProvider } = event;
    if (!usage || !modelId) return;

    const prompt_tokens = firstNum(usage, "inputTokens", "input_tokens", "prompt_tokens", "input");
    const completion_tokens = firstNum(usage, "outputTokens", "output_tokens", "completion_tokens", "output");

    if (prompt_tokens === 0 && completion_tokens === 0) return;

    store.record({
      date: todayStr(),
      provider_id: modelProvider || "",
      model: modelId,
      prompt_tokens,
      completion_tokens,
      call_count: 1,
    });
  });

  return store;
}

function firstNum(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  }
  return 0;
}
