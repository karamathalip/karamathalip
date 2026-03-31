/**
 * pipeline/scheduler.js
 *
 * Keep-alive process that runs orchestrator.js every day at 06:00 local time
 * using node-cron. Also exposes manual triggers via CLI flags.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   node pipeline/scheduler.js                 Start scheduler (keep-alive)
 *   node pipeline/scheduler.js --run-now       Trigger orchestrator immediately
 *   node pipeline/scheduler.js --status        Show next scheduled run time
 *   node pipeline/scheduler.js --dry-run       Pass --dry-run to orchestrator
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 *   npm install --save node-cron
 *   All orchestrator .env vars set (see orchestrator.js header)
 */

'use strict';

const path    = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const cron    = require('node-cron');
const fs      = require('fs-extra');

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ROOT   = path.join(__dirname, '..');
const CONFIG_DIR     = path.join(PROJECT_ROOT, 'config');
const SCHEDULER_LOG  = path.join(CONFIG_DIR, 'scheduler_log.json');

// Cron expression: every day at 06:00 local time
const CRON_SCHEDULE = '0 6 * * *';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
}

function divider(char = '═', width = 62) {
  return char.repeat(width);
}

/**
 * Append an entry to scheduler_log.json (keeps last 90 entries).
 */
async function appendSchedulerLog(entry) {
  try {
    await fs.ensureDir(CONFIG_DIR);
    let entries = [];
    try { entries = await fs.readJson(SCHEDULER_LOG); } catch (_) {}
    entries.push({ ...entry, logged_at: ts() });
    if (entries.length > 90) entries = entries.slice(-90);
    await fs.writeJson(SCHEDULER_LOG, entries, { spaces: 2 });
  } catch (err) {
    console.warn(`  ⚠  Could not write scheduler log: ${err.message}`);
  }
}

/**
 * Compute the next fire time for the given cron expression (local time).
 * Uses node-cron's internal schedule to avoid a heavy dependency.
 */
function nextRunTime() {
  // Simple calculation: next 06:00 local time
  const now  = new Date();
  const next = new Date(now);
  next.setHours(6, 0, 0, 0);
  if (next <= now) {
    // Already past 06:00 today — move to tomorrow
    next.setDate(next.getDate() + 1);
  }
  return next;
}

// ─── Orchestrator Launcher ────────────────────────────────────────────────────

/**
 * Dynamically load and run the orchestrator.
 * Isolated in a try/catch so a single crash never kills the scheduler process.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 */
async function launchOrchestrator(options = {}) {
  const start = Date.now();
  log('▶  Launching orchestrator...');

  // Inject --dry-run flag by manipulating argv before require
  const originalArgv = process.argv.slice();
  if (options.dryRun && !process.argv.includes('--dry-run')) {
    process.argv.push('--dry-run');
  }

  let result = 'unknown';

  try {
    // Fresh require each time so state resets between daily runs
    const orchPath = path.join(__dirname, 'orchestrator.js');

    // Bust the require cache so the module re-executes fully each run
    delete require.cache[require.resolve(orchPath)];

    const { run } = require(orchPath);
    if (typeof run !== 'function') {
      throw new Error('orchestrator.js does not export a run() function');
    }

    await run();
    result = 'success';
    log('✓  Orchestrator completed successfully.');
  } catch (err) {
    result = 'error';
    log(`✗  Orchestrator failed: ${err.message}`);
    if (err.stack) console.error(err.stack);
  } finally {
    // Restore argv
    process.argv.length = 0;
    originalArgv.forEach(a => process.argv.push(a));
  }

  const durationMs = Date.now() - start;
  const durationMin = (durationMs / 60_000).toFixed(1);
  log(`   Duration: ${durationMin} min`);

  await appendSchedulerLog({
    trigger:     options.dryRun ? 'dry-run' : (options.manual ? 'manual' : 'cron'),
    result,
    duration_ms: durationMs,
  });
}

// ─── CLI Modes ────────────────────────────────────────────────────────────────

async function showStatus() {
  const next = nextRunTime();
  const now  = new Date();
  const diffMs  = next - now;
  const diffH   = Math.floor(diffMs / 3_600_000);
  const diffM   = Math.floor((diffMs % 3_600_000) / 60_000);

  console.log(`\n${divider()}`);
  console.log('  english-made-fun / scheduler status');
  console.log(`${divider()}`);
  console.log(`  Cron schedule  : ${CRON_SCHEDULE}  (daily at 06:00 local)`);
  console.log(`  Current time   : ${now.toLocaleString()}`);
  console.log(`  Next run       : ${next.toLocaleString()}`);
  console.log(`  Time until run : ${diffH}h ${diffM}m`);

  try {
    const entries = await fs.readJson(SCHEDULER_LOG);
    const last = entries[entries.length - 1];
    if (last) {
      console.log(`\n  Last run       : ${last.logged_at}`);
      console.log(`  Last result    : ${last.result}`);
      console.log(`  Last duration  : ${(last.duration_ms / 60_000).toFixed(1)} min`);
    }
  } catch (_) {
    console.log('\n  No run history found.');
  }

  console.log(`\n  Log file       : ${SCHEDULER_LOG}`);
  console.log(`${divider()}\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2);
  const runNow  = args.includes('--run-now');
  const status  = args.includes('--status');
  const dryRun  = args.includes('--dry-run');

  // ── --status ────────────────────────────────────────────────────────────────
  if (status) {
    await showStatus();
    process.exit(0);
  }

  // ── --run-now / --dry-run (immediate, one-shot) ──────────────────────────
  if (runNow || (dryRun && !args.includes('--keep-alive'))) {
    console.log(`\n${divider()}`);
    console.log('  english-made-fun / scheduler  (one-shot trigger)');
    console.log(`${divider()}\n`);
    await launchOrchestrator({ dryRun, manual: true });
    process.exit(0);
  }

  // ── Default: start keep-alive scheduler ────────────────────────────────────
  console.log(`\n${divider()}`);
  console.log('  english-made-fun / scheduler  (keep-alive)');
  console.log(`  Cron : ${CRON_SCHEDULE}  →  daily at 06:00 local time`);
  console.log(`${divider()}\n`);

  log('Scheduler started.');
  log(`Next run: ${nextRunTime().toLocaleString()}`);

  await appendSchedulerLog({ trigger: 'boot', result: 'started' });

  // Register cron job
  const job = cron.schedule(CRON_SCHEDULE, async () => {
    log(`\n${divider('─')}`);
    log('CRON FIRED — starting daily pipeline run');
    log(divider('─'));
    await launchOrchestrator({ dryRun: false });
    log(`Next run: ${nextRunTime().toLocaleString()}`);
  }, {
    scheduled: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
  });

  // Graceful shutdown
  function shutdown(signal) {
    log(`\nReceived ${signal} — stopping scheduler.`);
    job.stop();
    appendSchedulerLog({ trigger: signal, result: 'stopped' }).finally(() => process.exit(0));
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep the process alive
  log('Scheduler is running. Press Ctrl+C to stop.\n');
}

main().catch(err => {
  console.error('\nScheduler fatal error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
