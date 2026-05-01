/**
 * サービス稼働 health-check
 *
 * 1時間ごとに APPROVED+verified なサービス全 endpoint へ HEAD/GET を投げ、
 * status code を Service.lastHealthStatus / lastHealthOk に記録する。
 *
 * 連続 5xx 失敗が 3 回続くと自動で reviewStatus=PENDING に下げる
 * (エージェント側に見えなくなる、admin 画面で復活可能)。
 *
 * 注意: 上流 API への課金フォロワーは出さない (HEAD or auth-less ping のみ)
 */

import { prisma } from "../lib/prisma.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const FAILURE_THRESHOLD = 3;              // 連続 5xx 3回で hide
const TIMEOUT_MS        = 10_000;

let cronTimer: NodeJS.Timeout | null = null;

async function probeService(s: { id: string; endpoint: string | null }): Promise<{ ok: boolean; status: number | null }> {
  if (!s.endpoint) return { ok: false, status: null };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    // HEAD を試して、サポートしてなければ GET にフォールバック
    let res = await fetch(s.endpoint, { method: "HEAD", signal: ctrl.signal }).catch(() => null);
    if (!res || res.status === 405) {
      res = await fetch(s.endpoint, { method: "GET", signal: ctrl.signal });
    }
    clearTimeout(timer);

    // 200-499 は「サービス生存」(401/403 は auth 不足だがサーバ自体は健在)
    return { ok: res.status >= 200 && res.status < 500, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

export async function runServiceHealthCheck(): Promise<{
  total: number;
  ok: number;
  fail: number;
  hidden: number;
}> {
  const services = await prisma.service.findMany({
    where:  { reviewStatus: "APPROVED", verified: true, endpoint: { not: null } },
    select: { id: true, name: true, endpoint: true, consecutiveFailures: true },
  });

  let ok = 0, fail = 0, hidden = 0;

  for (const s of services) {
    const result = await probeService(s);
    const data: {
      lastHealthCheckAt: Date;
      lastHealthStatus: number | null;
      lastHealthOk: boolean;
      consecutiveFailures?: number;
      reviewStatus?: "PENDING";
    } = {
      lastHealthCheckAt: new Date(),
      lastHealthStatus:  result.status,
      lastHealthOk:      result.ok,
    };

    if (result.ok) {
      data.consecutiveFailures = 0;
      ok++;
    } else {
      const newCount = (s.consecutiveFailures ?? 0) + 1;
      data.consecutiveFailures = newCount;
      fail++;
      if (newCount >= FAILURE_THRESHOLD) {
        data.reviewStatus = "PENDING";
        hidden++;
        console.warn(`[Health] 🔻 Hiding ${s.name} after ${newCount} consecutive failures`);
      }
    }

    await prisma.service.update({ where: { id: s.id }, data });
  }

  console.log(`[Health] checked ${services.length}: ok=${ok}, fail=${fail}, auto-hidden=${hidden}`);
  return { total: services.length, ok, fail, hidden };
}

export function startServiceHealthCron(): NodeJS.Timeout {
  // 起動 10 秒後に初回実行 (デプロイ時の即時可視化用)
  setTimeout(() => { void runServiceHealthCheck().catch(e => console.error("[Health] error:", e)); }, 10_000);

  cronTimer = setInterval(() => {
    void runServiceHealthCheck().catch(e => console.error("[Health] error:", e));
  }, CHECK_INTERVAL_MS);
  cronTimer.unref();
  console.log(`[Health] 🩺 service health cron started (${CHECK_INTERVAL_MS / 60000} min interval)`);
  return cronTimer;
}

export function stopServiceHealthCron(): void {
  if (cronTimer) clearInterval(cronTimer);
}
