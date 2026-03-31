// pipeline/scheduler.js
// Sets up a local cron-style scheduler to run daily batches automatically.
// Runs 3x per day at 07:00, 12:00, and 17:00 local time.
// Usage: node pipeline/scheduler.js  (keep this process running)
import "dotenv/config";
import { logger } from "./utils.js";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Schedule: [hour, minute] pairs (24h) ─────────────────────────────────
const SCHEDULE_TIMES = [
  [7, 0],   // 07:00 — morning batch
  [12, 0],  // 12:00 — midday batch
  [17, 0],  // 17:00 — afternoon batch
];

function getNextRunMs(hour, minute) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1); // tomorrow if already passed
  return next.getTime() - now.getTime();
}

function runBatch(label) {
  logger.info(`\n🕐 Scheduled batch starting: ${label}`);
  const result = spawnSync("node", ["pipeline/run_daily_batch.js"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env },
  });

  if (result.status !== 0) {
    logger.error(`Batch ${label} exited with code ${result.status}`);
  } else {
    logger.info(`✅ Batch ${label} complete.`);
  }
}

function scheduleAll() {
  for (const [hour, minute] of SCHEDULE_TIMES) {
    const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const delayMs = getNextRunMs(hour, minute);
    const delayMin = Math.round(delayMs / 60000);

    logger.info(`⏰ Scheduled batch at ${label} — in ${delayMin} minutes`);

    setTimeout(() => {
      runBatch(label);
      // Re-schedule for next day
      const nextDayMs = 24 * 60 * 60 * 1000;
      setInterval(() => runBatch(label), nextDayMs);
    }, delayMs);
  }
}

logger.info("━".repeat(56));
logger.info("  📅 ENGLISH MADE FUN — Scheduler Started");
logger.info(`  Runs at: ${SCHEDULE_TIMES.map(([h, m]) => `${h}:${String(m).padStart(2, "0")}`).join(", ")}`);
logger.info("━".repeat(56));

scheduleAll();

// Keep the process alive
process.on("uncaughtException", (err) => {
  logger.error(`Scheduler uncaught exception: ${err.message}`);
});
process.on("unhandledRejection", (reason) => {
  logger.error(`Scheduler unhandled rejection: ${reason}`);
});
