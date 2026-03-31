#!/usr/bin/env node

/**
 * Direct render invoker for vid_001.json
 * This script imports and runs the render agent directly without relying on CLI args.
 */

const path = require('path');

// Set working directory
process.chdir(path.join(__dirname));

// Import the render agent module
const { runRenderBatch } = require('./pipeline/render_agent.js');

(async () => {
  try {
    const scriptPath = path.join(__dirname, 'scripts', 'approved', 'vid_001.json');
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  English Made Fun - Render Agent                           ║');
    console.log('║  Rendering: scripts/approved/vid_001.json                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const summary = await runRenderBatch([scriptPath]);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  Render Complete                                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    process.exit(summary.failed.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n✗ Fatal Error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
})();
