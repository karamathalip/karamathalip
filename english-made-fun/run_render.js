#!/usr/bin/env node

/**
 * Helper script to run the render agent with a specific script.
 * Usage: node run_render.js scripts/approved/vid_001.json
 */

const path = require('path');
const { runRenderBatch } = require('./pipeline/render_agent.js');

const args = process.argv.slice(2);

(async () => {
  try {
    if (args.length === 0) {
      console.log('Usage: node run_render.js <script_path>');
      console.log('Example: node run_render.js scripts/approved/vid_001.json');
      process.exit(1);
    }

    const targets = args.map(p => 
      path.isAbsolute(p) ? p : path.join(process.cwd(), p)
    );

    console.log(`Running render for: ${targets.map(t => path.basename(t)).join(', ')}\n`);
    const summary = await runRenderBatch(targets);
    
    process.exit(summary.failed.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
