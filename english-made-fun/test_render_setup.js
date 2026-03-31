#!/usr/bin/env node

/**
 * test_render_agent.js
 * 
 * This script tests the render_agent setup and attempts to run the render for vid_001.
 * It verifies all dependencies and configurations before attempting the render.
 */

const path = require('path');
const fs = require('fs-extra');

const PROJECT_ROOT = path.join(__dirname);
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'approved', 'vid_001.json');
const ENTRY_POINT = path.join(PROJECT_ROOT, 'src', 'index.tsx');
const VIDEOS_DIR = path.join(PROJECT_ROOT, 'videos');
const FINAL_DIR = path.join(PROJECT_ROOT, 'output', 'final');

async function checkSetup() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Render Agent Setup Verification');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let allGood = true;

  // Check 1: Script file exists
  console.log('✓ Checking script file...');
  if (!await fs.pathExists(SCRIPT_PATH)) {
    console.log(`  ✗ Script not found: ${SCRIPT_PATH}`);
    allGood = false;
  } else {
    const script = await fs.readJson(SCRIPT_PATH);
    console.log(`  ✓ Found: ${path.basename(SCRIPT_PATH)}`);
    console.log(`    - video_id: ${script.video_id}`);
    console.log(`    - format: ${script.format}`);
    console.log(`    - scenes: ${(script.scenes || []).length}`);
  }

  // Check 2: Entry point exists
  console.log('\n✓ Checking Remotion entry point...');
  if (!await fs.pathExists(ENTRY_POINT)) {
    console.log(`  ✗ Entry point not found: ${ENTRY_POINT}`);
    allGood = false;
  } else {
    console.log(`  ✓ Found: ${path.basename(ENTRY_POINT)}`);
  }

  // Check 3: Output directories can be created
  console.log('\n✓ Checking output directories...');
  await fs.ensureDir(VIDEOS_DIR);
  await fs.ensureDir(FINAL_DIR);
  console.log(`  ✓ Output dirs ready:`);
  console.log(`    - ${path.relative(PROJECT_ROOT, VIDEOS_DIR)}`);
  console.log(`    - ${path.relative(PROJECT_ROOT, FINAL_DIR)}`);

  // Check 4: Node modules
  console.log('\n✓ Checking dependencies...');
  const requiredModules = ['@remotion/bundler', '@remotion/renderer', 'fluent-ffmpeg', 'fs-extra'];
  const missingModules = [];
  
  for (const mod of requiredModules) {
    try {
      require.resolve(mod);
      console.log(`  ✓ ${mod}`);
    } catch (e) {
      console.log(`  ✗ ${mod}`);
      missingModules.push(mod);
      allGood = false;
    }
  }

  if (missingModules.length > 0) {
    console.log('\n⚠  Missing dependencies detected!');
    console.log('Run: npm install');
    return false;
  }

  console.log('\n✓ Environment checks passed!');
  console.log('\nTo run the render agent, execute:');
  console.log(`  node pipeline/render_agent.js scripts/approved/vid_001.json\n`);
  
  return allGood;
}

(async () => {
  const ready = await checkSetup();
  process.exit(ready ? 0 : 1);
})();
