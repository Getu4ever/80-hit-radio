#!/usr/bin/env node
/**
 * Simulates a listener fast-forwarding through N tracks and measures
 * skip-to-play latency (buffering lag). Exits with code 2 when lag exceeds threshold.
 *
 * Usage: node scripts/simulate-radio-skip.mjs [--tracks=20] [--url=http://localhost:3000]
 */

import { chromium } from "playwright";

const TRACKS = Number(process.argv.find((a) => a.startsWith("--tracks="))?.split("=")[1] ?? 20);
const BASE_URL = process.argv.find((a) => a.startsWith("--url="))?.split("=")[1] ?? "http://localhost:3000";
const LAG_THRESHOLD_MS = 2500;
const SKIP_PLAY_TIMEOUT_MS = 10_000;
const FIRST_TRACK_TIMEOUT_MS = 20_000;

/** @type {{ skip: number, lagMs: number, title?: string, promoted?: boolean }[]} */
const results = [];

function log(msg) {
  console.log(msg);
}

function warn(msg) {
  console.warn(`⚠ ${msg}`);
}

async function waitForServer(url, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server not reachable at ${url}`);
}

async function getTrackTitle(page) {
  return page.locator("footer p.truncate.font-\\[family-name\\:var\\(--font-display\\)\\]").first().textContent();
}

async function waitForBenchPlaying(page, sinceSkip, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lagMs = await page.evaluate((since) => {
      const events = window.__radioBenchEvents ?? [];
      const hit = events.find(
        (e) => e.type === "playing" && e.at >= since && typeof e.lagMs === "number",
      );
      return hit?.lagMs ?? null;
    }, sinceSkip);
    if (lagMs != null) return lagMs;
    await page.waitForTimeout(80);
  }
  return null;
}

async function main() {
  log(`\n🎵 Radio skip simulation — ${TRACKS} tracks @ ${BASE_URL}\n`);
  await waitForServer(BASE_URL);

  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies",
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__RADIO_BENCH__ = true;
    window.__radioBenchEvents = [];
    const original = console.log.bind(console);
    console.log = (...args) => {
      const text = args.map(String).join(" ");
      if (text.includes("[RADIO-BENCH]")) {
        const match = text.match(/\[RADIO-BENCH\]\s+(\S+)\s+(.*)/);
        if (match) {
          try {
            const detail = JSON.parse(match[2]);
            window.__radioBenchEvents.push({ type: match[1], ...detail });
          } catch {
            window.__radioBenchEvents.push({ type: match[1], raw: match[2] });
          }
        }
      }
      original(...args);
    };
  });

  page.on("console", (msg) => {
    const text = msg.text();
    if (/video:waiting|video:stalled|buffer|stalled/i.test(text)) {
      warn(`console: ${text}`);
    }
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 60_000 });

  const playBtn = page.getByRole("button", { name: /^(Play|Pause)$/ });
  await playBtn.waitFor({ state: "visible", timeout: 15_000 });
  if (await playBtn.isDisabled()) {
    throw new Error("Play button disabled — stream access not granted");
  }

  log("Starting radio…");
  if ((await playBtn.getAttribute("aria-label")) === "Play") await playBtn.click();

  let title = "";
  const firstDeadline = Date.now() + FIRST_TRACK_TIMEOUT_MS;
  while (Date.now() < firstDeadline) {
    title = (await getTrackTitle(page))?.trim() ?? "";
    if (title && title !== "80s Hit Radio") break;
    await page.waitForTimeout(200);
  }
  if (!title || title === "80s Hit Radio") {
    throw new Error("First track never loaded");
  }
  log(`First track: ${title}`);

  const firstSkipAt = await page.evaluate(() => performance.now());
  const firstLag = await waitForBenchPlaying(page, firstSkipAt - 500, FIRST_TRACK_TIMEOUT_MS);
  log(`First track play latency: ${firstLag ?? "TIMEOUT"}ms\n`);

  const nextBtn = page.getByRole("button", { name: "Next track" });

  for (let i = 1; i <= TRACKS; i++) {
    const prevTitle = title;
    const skipAt = await page.evaluate(() => performance.now());
    await nextBtn.click();

    const changeStart = Date.now();
    let changed = false;
    while (Date.now() - changeStart < SKIP_PLAY_TIMEOUT_MS) {
      title = (await getTrackTitle(page))?.trim() ?? "";
      if (title && title !== prevTitle && title !== "80s Hit Radio") {
        changed = true;
        break;
      }
      await page.waitForTimeout(50);
    }
    const trackChangedMs = Date.now() - changeStart;

    if (!changed) {
      results.push({ skip: i, lagMs: SKIP_PLAY_TIMEOUT_MS, title: prevTitle });
      warn(`Skip ${i}: track title did not change`);
      continue;
    }

    const playLatencyMs = await waitForBenchPlaying(page, skipAt, SKIP_PLAY_TIMEOUT_MS);
    const totalLagMs = playLatencyMs ?? SKIP_PLAY_TIMEOUT_MS;
    const promoted = await page.evaluate((since) => {
      return (window.__radioBenchEvents ?? []).some(
        (e) => e.type === "buffer:promote" && e.at >= since,
      );
    }, skipAt);

    results.push({ skip: i, lagMs: totalLagMs, title, promoted });

    const flag = totalLagMs >= LAG_THRESHOLD_MS ? " ⚠ LAG" : "";
    const buf = promoted ? " [buffer hit]" : "";
    log(
      `Skip ${String(i).padStart(2)}: ${totalLagMs}ms to play` +
        ` (metadata ${trackChangedMs}ms) → ${title}${buf}${flag}`,
    );

    await page.waitForTimeout(250);
  }

  await browser.close();

  const lags = results.filter((r) => r.lagMs >= LAG_THRESHOLD_MS);
  const avg = results.reduce((s, r) => s + r.lagMs, 0) / Math.max(results.length, 1);
  const max = Math.max(...results.map((r) => r.lagMs), 0);
  const promotions = results.filter((r) => r.promoted).length;

  log("\n── Summary ──");
  log(`  Skips:        ${results.length}/${TRACKS}`);
  log(`  Avg lag:      ${avg.toFixed(0)}ms`);
  log(`  Max lag:      ${max.toFixed(0)}ms`);
  log(`  Buffer hits:  ${promotions}/${results.length}`);
  log(`  Threshold:    ${LAG_THRESHOLD_MS}ms`);
  log(`  Lags:         ${lags.length}`);

  if (lags.length > 0) {
    log("\n❌ Buffering lag detected.\n");
    process.exitCode = 2;
    return;
  }

  log("\n✅ No significant buffering lag detected.\n");
}

main().catch((err) => {
  console.error("Simulation failed:", err.message);
  process.exit(1);
});
