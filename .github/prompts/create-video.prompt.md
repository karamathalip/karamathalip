---
name: "Create Video"
description: "Render a final English Made Fun video for an approved script id like vid_002"
argument-hint: "Script id or approved JSON path, e.g. vid_002 or english-made-fun/scripts/approved/vid_002.json"
agent: "agent"
---
Create a fully rendered video for `${input:scriptIdOrPath:vid_002}` using the English Made Fun production pipeline in [english-made-fun](../../english-made-fun/README.md).

Requirements:
- Treat the input as either a bare script id like `vid_002` or a path to an approved script JSON.
- Work inside [english-made-fun](../../english-made-fun/README.md), not the root prototype.
- Resolve the target script from `english-made-fun/scripts/approved/`.
- If `english-made-fun/scripts/approved/<id>.json` does not exist, search all approved scripts for a matching `video_id`.
- If the script cannot be found, ask one concise clarifying question and stop.

Execution workflow:
1. Resolve the approved script file for the requested id or path.
2. Read the script and verify its `video_id`.
3. Generate any missing per-script assets using targeted agents, in this order:
   - `node pipeline/image_agent.js <scriptPath>`
   - `node pipeline/voice_agent.js <scriptPath>`
   - `node pipeline/sfx_agent.js <scriptPath>`
4. Render the final video with:
   - `node pipeline/render_agent.js <scriptPath>`
5. Verify the expected output file exists at `english-made-fun/output/final/<video_id>_final.mp4`.
6. If the final audio-merged file is missing but a silent render exists, report that clearly and include the silent output path.

Behavior rules:
- Do the work. Do not stop at explanation or planning.
- Prefer targeted single-script commands over the full orchestrator.
- Do not upload the video unless the user explicitly asks for upload.
- Surface concrete failures with the exact step that failed.
- Keep the final response short and include:
  - the resolved script path
  - the final output file path
   - whether image, voice, and SFX generation ran or were already available

Example invocations:
- `/create-video vid_002`
- `/create-video english-made-fun/scripts/approved/vid_002.json`