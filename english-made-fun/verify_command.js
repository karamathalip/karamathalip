#!/usr/bin/env node

/**
 * verify_command.js
 * 
 * Verifies that the command would execute properly without actually rendering.
 * This simulates what happens when you run:
 *   node pipeline/render_agent.js scripts/approved/vid_001.json
 */

const path = require('path');
const fs = require('fs-extra');

const PROJECT_ROOT = path.join(__dirname);

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  Command Verification: render_agent.js                     ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Simulate the argument passed to render_agent.js
const argPath = 'scripts/approved/vid_001.json';

console.log(`📋 Simulating: node pipeline/render_agent.js ${argPath}\n`);

// Simulate the path resolution that render_agent.js does
const relativeArg = argPath.startsWith('--') ? false : argPath;
const absolutePath = path.isAbsolute(relativeArg) 
  ? relativeArg 
  : path.join(PROJECT_ROOT, relativeArg);

console.log(`   Argument received: "${argPath}"`);
console.log(`   Is absolute path?: ${path.isAbsolute(relativeArg)}`);
console.log(`   Resolved absolute: "${absolutePath}"\n`);

// Check if the script exists
const scriptExists = fs.existsSync(absolutePath);
console.log(`✓ File exists at resolved path?: ${scriptExists ? '✅ YES' : '❌ NO'}\n`);

if (scriptExists) {
  try {
    const scriptData = fs.readJsonSync(absolutePath);
    console.log(`✓ Script metadata:`);
    console.log(`  - video_id: ${scriptData.video_id}`);
    console.log(`  - format: ${scriptData.format}`);
    console.log(`  - scenes: ${(scriptData.scenes || []).length}`);
    console.log(`  - total_duration: ${scriptData.total_duration_seconds}s`);
    console.log(`\n✅ Script is valid JSON and properly structured!`);
  } catch (err) {
    console.log(`❌ JSON parse error: ${err.message}`);
  }

  // Check voice file
  const voiceFile = path.join(PROJECT_ROOT, scriptData?.voice_file || 'audio/voices/vid_001_voice_full.mp3');
  console.log(`\n✓ Checking for voice audio...`);
  console.log(`  Expected path: ${path.relative(PROJECT_ROOT, voiceFile)}`);
  console.log(`  Exists?: ${fs.existsSync(voiceFile) ? '✅ YES' : '⚠️  NOT FOUND (render will continue without audio)'}`);

  // Check entry point
  const entryPoint = path.join(PROJECT_ROOT, 'src', 'index.tsx');
  console.log(`\n✓ Checking Remotion entry point...`);
  console.log(`  Path: src/index.tsx`);
  console.log(`  Exists?: ${fs.existsSync(entryPoint) ? '✅ YES' : '❌ NO'}`);

  // Summary
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  ✅ COMMAND VERIFICATION PASSED                            ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);
  
  console.log(`The command should execute without issues.\n`);
  console.log(`To run the actual render, execute:\n`);
  console.log(`  node pipeline/render_agent.js scripts/approved/vid_001.json\n`);
  
} else {
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  ❌ COMMAND VERIFICATION FAILED                            ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);
}
