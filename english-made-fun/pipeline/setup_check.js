/**
 * pipeline/setup_check.js
 *
 * One-time setup verification script. Run this before your first production
 * run to confirm every system dependency, API key, folder, and tool is
 * correctly configured.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   node pipeline/setup_check.js              Full check (recommended)
 *   node pipeline/setup_check.js --fix        Auto-create missing folders
 *   node pipeline/setup_check.js --quiet      Only print failures
 *   node pipeline/setup_check.js --no-api     Skip live API ping tests
 *
 * ── What it checks ────────────────────────────────────────────────────────────
 *   1. Environment variables (all required .env keys)
 *   2. Node.js version and npm packages
 *   3. Required folder structure
 *   4. Config files (local_config, topics_queue, sfx_library, voice_profiles)
 *   5. Live API connectivity (Anthropic, ElevenLabs, Together AI, Inworld, YouTube)
 *   6. FFmpeg binary availability
 *   7. Remotion bundle test (optional, slow)
 *   8. Starter batch files (day01–day07)
 */

'use strict';

const path    = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs      = require('fs');
const https   = require('https');
const http    = require('http');
const { execSync } = require('child_process');

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  dim:    '\x1b[2m',
};

// ─── CLI flags ────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const FIX     = args.includes('--fix');
const QUIET   = args.includes('--quiet');
const NO_API  = args.includes('--no-api');

// ─── State ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.join(__dirname, '..');
let passed  = 0;
let failed  = 0;
let warned  = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function divider(char = '═', width = 64) {
  return char.repeat(width);
}

function ok(label, detail = '') {
  passed++;
  if (!QUIET) {
    console.log(`  ${C.green}✓${C.reset}  ${label}${detail ? C.dim + '  ' + detail + C.reset : ''}`);
  }
}

function fail(label, detail = '', fix = '') {
  failed++;
  console.log(`  ${C.red}✗${C.reset}  ${C.bold}${label}${C.reset}${detail ? '\n     ' + C.dim + detail + C.reset : ''}${fix ? '\n     ' + C.yellow + '→ Fix: ' + fix + C.reset : ''}`);
}

function warn(label, detail = '') {
  warned++;
  if (!QUIET) {
    console.log(`  ${C.yellow}⚠${C.reset}  ${label}${detail ? C.dim + '  ' + detail + C.reset : ''}`);
  }
}

function section(title) {
  if (!QUIET) {
    console.log(`\n${C.cyan}${C.bold}${divider('─')}${C.reset}`);
    console.log(`${C.cyan}${C.bold}  ${title}${C.reset}`);
    console.log(`${C.cyan}${divider('─')}${C.reset}`);
  } else {
    console.log(`\n[ ${title} ]`);
  }
}

function resolvedPath(rel) {
  return path.join(PROJECT_ROOT, rel);
}

/** Simple HTTPS GET returning response body string. */
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/** Simple HTTPS POST returning status + body. */
function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const urlObj  = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port:     urlObj.port || 443,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

// ─── CHECK 1: ENVIRONMENT VARIABLES ──────────────────────────────────────────

async function checkEnvVars() {
  section('1. ENVIRONMENT VARIABLES (.env)');

  const required = [
    { key: 'ANTHROPIC_API_KEY',        desc: 'Claude API (script generation, analysis)',         prefix: 'sk-ant-' },
    { key: 'ELEVEN_API_KEY',           desc: 'ElevenLabs (SFX generation)',                      prefix: null },
    { key: 'INWORLD_API_KEY',          desc: 'Inworld (TTS voice generation)',                   prefix: null },
    { key: 'INWORLD_WORKSPACE_ID',     desc: 'Inworld workspace slug',                           prefix: null },
    { key: 'INWORLD_CHARACTER_ID',     desc: 'Inworld character resource name',                  prefix: null },
    { key: 'TOGETHER_API_KEY',         desc: 'Together AI (Stable Diffusion images)',            prefix: null },
    { key: 'OPENAI_API_KEY',           desc: 'OpenAI (DALL·E 3 thumbnails)',                     prefix: 'sk-' },
    { key: 'YOUTUBE_CLIENT_ID',        desc: 'YouTube OAuth2 client ID',                         prefix: null },
    { key: 'YOUTUBE_CLIENT_SECRET',    desc: 'YouTube OAuth2 client secret',                     prefix: null },
    { key: 'YOUTUBE_REFRESH_TOKEN',    desc: 'YouTube OAuth2 refresh token (obtained via auth)', prefix: null },
  ];

  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    fail('.env file not found', envPath, 'Copy .env.example to .env and fill in your keys');
  } else {
    ok('.env file exists', envPath);
  }

  let allSet = true;
  for (const { key, desc, prefix } of required) {
    const val = process.env[key];
    if (!val || val.trim() === '') {
      fail(`${key} not set`, desc, `Add ${key}=your_value to .env`);
      allSet = false;
    } else if (prefix && !val.startsWith(prefix)) {
      warn(`${key} set but prefix looks wrong`, `Expected to start with "${prefix}" — double-check the value`);
    } else {
      ok(`${key}`, `${desc} — ${val.slice(0, 8)}...`);
    }
  }
  return allSet;
}

// ─── CHECK 2: NODE VERSION & PACKAGES ────────────────────────────────────────

async function checkNodeAndPackages() {
  section('2. NODE.JS VERSION & NPM PACKAGES');

  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (major >= 18) {
    ok(`Node.js ${nodeVersion}`, 'v18+ required');
  } else {
    fail(`Node.js ${nodeVersion}`, 'v18 or higher required', 'Upgrade Node.js: https://nodejs.org');
  }

  const requiredPackages = [
    '@anthropic-ai/sdk',
    'axios',
    'dotenv',
    'fluent-ffmpeg',
    'fs-extra',
    'googleapis',
    'node-cron',
    'node-fetch',
    'openai',
    '@remotion/bundler',
    '@remotion/renderer',
    'remotion',
    'zod',
  ];

  const pkgJsonPath = path.join(PROJECT_ROOT, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    fail('package.json not found', PROJECT_ROOT, 'Run: npm init -y in the project root');
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  for (const name of requiredPackages) {
    const nodeModulesPath = path.join(PROJECT_ROOT, 'node_modules', name);
    if (fs.existsSync(nodeModulesPath)) {
      ok(name, allDeps[name] ? `v${allDeps[name].replace(/[\^~]/, '')}` : 'installed');
    } else {
      fail(name, 'not installed', `Run: npm install --save ${name}`);
    }
  }
}

// ─── CHECK 3: FOLDER STRUCTURE ───────────────────────────────────────────────

async function checkFolders() {
  section('3. FOLDER STRUCTURE');

  const requiredDirs = [
    'config',
    'scripts',
    'scripts/approved',
    'images',
    'images/cache',
    'images/reuse_library',
    'audio',
    'audio/voice',
    'audio/sfx',
    'renders',
    'templates',
    'pipeline',
  ];

  for (const dir of requiredDirs) {
    const fullPath = resolvedPath(dir);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      ok(dir + '/', fullPath);
    } else {
      if (FIX) {
        try {
          fs.mkdirSync(fullPath, { recursive: true });
          ok(`${dir}/  ${C.yellow}[created]${C.green}`, fullPath);
        } catch (e) {
          fail(dir + '/', `Could not create: ${e.message}`, `Manually create: mkdir -p "${fullPath}"`);
        }
      } else {
        fail(dir + '/', `Directory does not exist`, `Run with --fix to auto-create, or: mkdir -p "${fullPath}"`);
      }
    }
  }
}

// ─── CHECK 4: CONFIG FILES ────────────────────────────────────────────────────

async function checkConfigFiles() {
  section('4. CONFIGURATION FILES');

  const configFiles = [
    {
      rel: 'config/local_config.json',
      required_keys: ['rendering', 'audio', 'images', 'upload', 'pipeline', 'scheduling'],
    },
    {
      rel: 'config/topics_queue.json',
      is_array: true,
      min_items: 5,
      desc: 'topics queue',
    },
    {
      rel: 'config/sfx_library.json',
      required_keys: ['cues'],
    },
    {
      rel: 'config/voice_profiles.json',
      required_keys: ['profiles'],
    },
    {
      rel: 'config/competitors.json',
      is_array: true,
      min_items: 1,
      desc: 'competitors list',
    },
  ];

  for (const cfg of configFiles) {
    const fullPath = resolvedPath(cfg.rel);
    if (!fs.existsSync(fullPath)) {
      fail(cfg.rel, 'File does not exist', `Run the config generator or create the file manually`);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
      fail(cfg.rel, `Invalid JSON: ${e.message}`, 'Fix the JSON syntax');
      continue;
    }

    if (cfg.is_array) {
      if (!Array.isArray(parsed)) {
        fail(cfg.rel, `Expected array at root`, 'File should be a JSON array [...]');
      } else if (parsed.length < (cfg.min_items || 1)) {
        warn(cfg.rel, `Array has only ${parsed.length} item(s) — expected at least ${cfg.min_items}`);
      } else {
        ok(cfg.rel, `${parsed.length} items`);
      }
    } else {
      const missingKeys = (cfg.required_keys || []).filter(k => !(k in parsed));
      if (missingKeys.length > 0) {
        fail(cfg.rel, `Missing keys: ${missingKeys.join(', ')}`, 'Regenerate or manually add missing sections');
      } else {
        ok(cfg.rel, (cfg.required_keys || []).join(', ') + ' keys present');
      }
    }
  }

  // Check starter batch files
  const batchFiles = ['day01', 'day02', 'day03', 'day04', 'day05', 'day06', 'day07'];
  let batchOk = 0;
  for (const f of batchFiles) {
    const p = resolvedPath(`scripts/${f}.json`);
    if (fs.existsSync(p)) { batchOk++; }
  }
  if (batchOk === 7) {
    ok('scripts/day01–day07.json', 'All 7 starter batch files present');
  } else if (batchOk > 0) {
    warn(`scripts/dayXX.json`, `${batchOk}/7 starter batch files present`);
  } else {
    warn('scripts/day01–day07.json', 'No starter batch files found — run the batch generator');
  }
}

// ─── CHECK 5: PIPELINE SCRIPTS ───────────────────────────────────────────────

async function checkPipelineScripts() {
  section('5. PIPELINE SCRIPTS');

  const scripts = [
    'pipeline/orchestrator.js',
    'pipeline/scheduler.js',
    'pipeline/script_agent.js',
    'pipeline/viral_prediction_agent.js',
    'pipeline/voice_agent.js',
    'pipeline/sfx_agent.js',
    'pipeline/image_agent.js',
    'pipeline/render_agent.js',
    'pipeline/upload_agent.js',
    'pipeline/feedback_agent.js',
    'pipeline/audience_agent.js',
    'pipeline/competitor_agent.js',
    'pipeline/revenue_agent.js',
  ];

  for (const script of scripts) {
    const fullPath = resolvedPath(script);
    if (!fs.existsSync(fullPath)) {
      fail(script, 'File does not exist');
    } else {
      const size = fs.statSync(fullPath).size;
      if (size < 500) {
        warn(script, `File is very small (${size} bytes) — may be empty or incomplete`);
      } else {
        ok(script, `${(size / 1024).toFixed(1)} KB`);
      }
    }
  }
}

// ─── CHECK 6: FFMPEG ──────────────────────────────────────────────────────────

async function checkFFmpeg() {
  section('6. FFMPEG');

  try {
    const output = execSync('ffmpeg -version 2>&1', { timeout: 5000 }).toString();
    const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    ok('ffmpeg binary', `version ${version}`);
  } catch (e) {
    fail('ffmpeg not found', 'Required for audio merging and concat in render_agent.js', 'Install FFmpeg: https://ffmpeg.org/download.html or via: winget install ffmpeg');
  }

  try {
    execSync('ffprobe -version 2>&1', { timeout: 5000 });
    ok('ffprobe binary', 'required for audio metadata');
  } catch (e) {
    warn('ffprobe not found', 'Optional but recommended — usually bundled with ffmpeg');
  }
}

// ─── CHECK 7: LIVE API TESTS ──────────────────────────────────────────────────

async function checkAPIs() {
  section('7. LIVE API CONNECTIVITY');

  if (NO_API) {
    warn('API checks skipped', 'Run without --no-api to test live connectivity');
    return;
  }

  // ── Anthropic ────────────────────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const res = await httpsPost(
        'https://api.anthropic.com/v1/messages',
        { model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'ping' }] },
        { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
      );
      if (res.status === 200) {
        ok('Anthropic API', 'ping successful');
      } else if (res.status === 401) {
        fail('Anthropic API', '401 Unauthorized — invalid API key', 'Check ANTHROPIC_API_KEY in .env');
      } else if (res.status === 429) {
        warn('Anthropic API', '429 Rate limited — key is valid but quota exceeded');
      } else {
        warn('Anthropic API', `HTTP ${res.status} — unexpected response`);
      }
    } catch (e) {
      fail('Anthropic API', `Connection error: ${e.message}`, 'Check network connectivity');
    }
  } else {
    fail('Anthropic API', 'ANTHROPIC_API_KEY not set — skipping ping');
  }

  // ── ElevenLabs ───────────────────────────────────────────────────────────
  const elevenKey = process.env.ELEVEN_API_KEY;
  if (elevenKey) {
    try {
      const res = await httpsGet('https://api.elevenlabs.io/v1/user', { 'xi-api-key': elevenKey });
      if (res.status === 200) {
        const user = JSON.parse(res.body);
        const used = user.subscription?.character_count || 0;
        const limit = user.subscription?.character_limit || 0;
        ok('ElevenLabs API', `authenticated — ${used.toLocaleString()}/${limit.toLocaleString()} chars used`);
      } else if (res.status === 401) {
        fail('ElevenLabs API', '401 Unauthorized — invalid API key', 'Check ELEVEN_API_KEY in .env');
      } else {
        warn('ElevenLabs API', `HTTP ${res.status}`);
      }
    } catch (e) {
      fail('ElevenLabs API', `Connection error: ${e.message}`);
    }
  } else {
    fail('ElevenLabs API', 'ELEVEN_API_KEY not set — skipping ping');
  }

  // ── Together AI ───────────────────────────────────────────────────────────
  const togetherKey = process.env.TOGETHER_API_KEY;
  if (togetherKey) {
    try {
      const res = await httpsGet('https://api.together.xyz/v1/models', { 'Authorization': `Bearer ${togetherKey}` });
      if (res.status === 200) {
        ok('Together AI API', 'authenticated — model list fetched');
      } else if (res.status === 401) {
        fail('Together AI API', '401 Unauthorized — invalid API key', 'Check TOGETHER_API_KEY in .env');
      } else {
        warn('Together AI API', `HTTP ${res.status}`);
      }
    } catch (e) {
      fail('Together AI API', `Connection error: ${e.message}`);
    }
  } else {
    fail('Together AI API', 'TOGETHER_API_KEY not set — skipping ping');
  }

  // ── OpenAI ────────────────────────────────────────────────────────────────
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const res = await httpsGet('https://api.openai.com/v1/models', { 'Authorization': `Bearer ${openaiKey}` });
      if (res.status === 200) {
        ok('OpenAI API', 'authenticated — DALL·E 3 access confirmed');
      } else if (res.status === 401) {
        fail('OpenAI API', '401 Unauthorized — invalid API key', 'Check OPENAI_API_KEY in .env');
      } else {
        warn('OpenAI API', `HTTP ${res.status}`);
      }
    } catch (e) {
      fail('OpenAI API', `Connection error: ${e.message}`);
    }
  } else {
    fail('OpenAI API', 'OPENAI_API_KEY not set — skipping ping');
  }

  // ── Inworld ───────────────────────────────────────────────────────────────
  const inworldKey       = process.env.INWORLD_API_KEY;
  const inworldWorkspace = process.env.INWORLD_WORKSPACE_ID;
  const inworldCharacter = process.env.INWORLD_CHARACTER_ID;
  if (inworldKey && inworldWorkspace && inworldCharacter) {
    const token = Buffer.from(`${inworldKey}:`).toString('base64');
    const synthesizeUrl =
      `https://studio.inworld.ai/v1/${inworldWorkspace}/${inworldCharacter}:synthesize`;
    try {
      const res = await httpsPost(
        synthesizeUrl,
        { text: 'hello', audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000 } },
        { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' }
      );
      if (res.status === 200) {
        ok('Inworld TTS API', 'ping successful — synthesis endpoint reachable');
      } else if (res.status === 401 || res.status === 403) {
        fail('Inworld TTS API', `HTTP ${res.status} — invalid key or workspace`, 'Check INWORLD_API_KEY, INWORLD_WORKSPACE_ID, INWORLD_CHARACTER_ID in .env');
      } else if (res.status === 404) {
        fail('Inworld TTS API', '404 — character or workspace not found', 'Verify INWORLD_WORKSPACE_ID and INWORLD_CHARACTER_ID match your Inworld Studio project');
      } else {
        warn('Inworld TTS API', `HTTP ${res.status} — unexpected response`);
      }
    } catch (e) {
      fail('Inworld TTS API', `Connection error: ${e.message}`);
    }
  } else {
    fail('Inworld TTS API', 'One or more INWORLD_* vars not set', 'Set INWORLD_API_KEY, INWORLD_WORKSPACE_ID, INWORLD_CHARACTER_ID in .env');
  }

  // ── YouTube OAuth ─────────────────────────────────────────────────────────
  const ytClientId     = process.env.YOUTUBE_CLIENT_ID;
  const ytClientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const ytRefreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!ytClientId || !ytClientSecret) {
    fail('YouTube OAuth', 'YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET not set', 'Create OAuth2 credentials at console.cloud.google.com');
  } else if (!ytRefreshToken) {
    fail('YouTube OAuth', 'YOUTUBE_REFRESH_TOKEN not set', 'Run: node pipeline/upload_agent.js --auth to complete OAuth flow');
  } else {
    // Test token exchange
    try {
      const tokenBody = new URLSearchParams({
        client_id:     ytClientId,
        client_secret: ytClientSecret,
        refresh_token: ytRefreshToken,
        grant_type:    'refresh_token',
      });
      const res = await httpsPost(
        'https://oauth2.googleapis.com/token',
        tokenBody.toString(),
        { 'Content-Type': 'application/x-www-form-urlencoded' }
      );
      const parsed = JSON.parse(res.body);
      if (parsed.access_token) {
        ok('YouTube OAuth', 'refresh token exchanged successfully — YouTube API ready');
      } else {
        fail('YouTube OAuth', `Token exchange failed: ${parsed.error || 'unknown error'}`, 'Re-run the OAuth flow: node pipeline/upload_agent.js --auth');
      }
    } catch (e) {
      fail('YouTube OAuth', `Token exchange error: ${e.message}`);
    }
  }
}

// ─── CHECK 8: REMOTION ────────────────────────────────────────────────────────

async function checkRemotion() {
  section('8. REMOTION PROJECT');

  const remotionDirs = [
    'english-made-fun-remotion/src',
    'english-made-fun-remotion/public',
  ];

  for (const dir of remotionDirs) {
    const fullPath = resolvedPath(dir);
    if (fs.existsSync(fullPath)) {
      ok(dir + '/', 'exists');
    } else {
      fail(dir + '/', 'Remotion project directory not found', 'Verify the Remotion project was scaffolded correctly');
    }
  }

  const remotionFiles = [
    'english-made-fun-remotion/src/index.tsx',
    'english-made-fun-remotion/src/Root.tsx',
    'english-made-fun-remotion/remotion.config.ts',
  ];

  for (const file of remotionFiles) {
    const fullPath = resolvedPath(file);
    if (fs.existsSync(fullPath)) {
      ok(file, `${(fs.statSync(fullPath).size / 1024).toFixed(1)} KB`);
    } else {
      fail(file, 'Required Remotion file missing', 'Check that all Remotion source files were created');
    }
  }

  // Check @remotion packages in node_modules
  const remotionPkgs = ['remotion', '@remotion/bundler', '@remotion/renderer'];
  for (const pkg of remotionPkgs) {
    const pkgPath = path.join(PROJECT_ROOT, 'node_modules', pkg);
    if (fs.existsSync(pkgPath)) {
      ok(pkg, 'installed');
    } else {
      fail(pkg, 'not installed', `Run: npm install --save ${pkg}`);
    }
  }
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────────

function printSummary() {
  const total = passed + failed + warned;
  console.log(`\n${divider()}`);
  console.log(`  ${C.bold}SETUP CHECK SUMMARY${C.reset}`);
  console.log(divider());
  console.log(`  Checks run    : ${total}`);
  console.log(`  ${C.green}Passed${C.reset}        : ${passed}`);
  console.log(`  ${C.yellow}Warnings${C.reset}      : ${warned}`);
  console.log(`  ${C.red}Failed${C.reset}        : ${failed}`);
  console.log('');

  if (failed === 0 && warned === 0) {
    console.log(`  ${C.green}${C.bold}✓ All checks passed. Your pipeline is ready to run!${C.reset}`);
    console.log(`\n  Start with:  node pipeline/scheduler.js --run-now`);
    console.log(`  Or dry-run:  node pipeline/scheduler.js --dry-run\n`);
  } else if (failed === 0) {
    console.log(`  ${C.yellow}${C.bold}⚠ Setup complete with warnings.${C.reset}`);
    console.log(`  ${C.dim}Pipeline can run — review warnings before production.${C.reset}`);
    console.log(`\n  Start with:  node pipeline/scheduler.js --run-now\n`);
  } else {
    console.log(`  ${C.red}${C.bold}✗ ${failed} check(s) failed. Fix issues before running the pipeline.${C.reset}`);
    console.log(`\n  ${C.dim}After fixing, re-run:  node pipeline/setup_check.js${C.reset}\n`);
  }

  console.log(divider());
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${divider()}`);
  console.log(`  ${C.bold}english-made-fun / setup_check.js${C.reset}`);
  console.log(`  ${C.dim}Verifying all pipeline dependencies before first run${C.reset}`);
  console.log(divider());

  if (FIX)    console.log(`\n  ${C.yellow}--fix mode: missing folders will be auto-created${C.reset}`);
  if (QUIET)  console.log(`\n  ${C.dim}--quiet mode: only failures shown${C.reset}`);
  if (NO_API) console.log(`\n  ${C.dim}--no-api mode: live API tests skipped${C.reset}`);

  await checkEnvVars();
  await checkNodeAndPackages();
  await checkFolders();
  await checkConfigFiles();
  await checkPipelineScripts();
  await checkFFmpeg();
  await checkAPIs();
  await checkRemotion();

  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\nFatal error in setup_check.js:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
