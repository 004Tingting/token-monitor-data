#!/usr/bin/env node
/**
 * token-monitor-data：从 hub 公开端点拉取最新快照 → 写 token-monitor.json
 * 由 .github/workflows/refresh.yml 每 15 分钟调用；也可手动 node refresh.mjs
 * 拉取失败时静默保留旧文件（exit 0），工作流据此跳过提交。
 */
import fs from "node:fs";

const HUB = "https://token-monitor-hub.saikouting004.workers.dev";
const OUT = "token-monitor.json";
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function main() {
  const res = await fetch(`${HUB}/api/public/stats`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const s = await res.json();
  if (!s || s.ok !== true) throw new Error("bad payload");
  const p = s.periods ?? {};
  const pick = (name) => ({ totalTokens: num(p[name]?.totalTokens), costUsd: num(p[name]?.costUsd) });
  const preview = s.historyPreview ?? {};
  const payload = {
    source: "token-monitor-hub",
    fetchedAt: new Date().toISOString(),
    hubUpdatedAt: String(s.updatedAt ?? ""),
    staleAfterMs: num(s.staleAfterMs),
    deviceCount: num(s.deviceCount),
    periods: { today: pick("today"), month: pick("month"), allTime: pick("allTime") },
    daily: (Array.isArray(preview.daily) ? preview.daily : []).map((d) => ({
      date: String(d.date ?? ""),
      tokens: num(d.tokens),
      cost: num(d.cost),
      activeTimeMs: num(d.activeTimeMs),
    })),
    monthly: (Array.isArray(preview.monthly) ? preview.monthly : []).map((m) => ({
      month: String(m.month ?? ""),
      tokens: num(m.tokens),
      cost: num(m.cost),
      activeTimeMs: num(m.activeTimeMs),
    })),
  };
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `ok snapshot: ${payload.deviceCount} devices | today ${payload.periods.today.totalTokens} | allTime ${payload.periods.allTime.totalTokens}`,
  );
}

main().catch((e) => {
  // hub 不可达：静默保留旧文件（工作流据此跳过提交）
  console.error(`hub unreachable, keeping old snapshot: ${e.message}`);
});
