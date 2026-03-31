// pipeline/script_agent.js
// Agent 1: Generates structured video scripts via Claude API
import Anthropic from "@anthropic-ai/sdk";
import { logger, writeJSON, readJSON, PATHS, withRetry, datestamp } from "./utils.js";
import path from "path";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a world-class YouTube scriptwriter specialising in English learning Shorts.
Your output MUST be valid JSON only — no markdown fences, no prose, no explanation.
Generate exactly one script matching the requested format and topic.`;

const FORMAT_INSTRUCTIONS = {
  "fail_fix": `
FORMAT: Fail → Fix Stickman Skit
Structure:
- 0-3s: Hook — stickman dramatically fails saying the WRONG version. Bold red X on screen.
- 3-12s: Wrong version with exaggerated slapstick punishment. Voice: "Oof… that hurts."
- 12-25s: Screen wipe → "Correct version →" stickman succeeds. Voice: "Now you sound like a native!"
- 25-40s: Side-by-side comparison with text highlights (red = wrong, green = correct)
- 40-55s: 3 quick remix examples using the same rule in different contexts
- 55-60s: CTA — "Tag someone who says this wrong!" + subscribe prompt + stickman winks`,

  "word_explosion": `
FORMAT: Word Explosion Visual Build
Structure:
- 0-3s: Single word appears tiny → explodes into giant colourful letters + confetti
- 3-15s: Base word + first visual (icon or mini scene for meaning 1)
- 15-35s: Rapid chain — word breaks apart and rebuilds for each meaning (up to 5)
- 35-50s: Mini story using ALL meanings in one sentence with stickman cameo
- 50-60s: Final "master sentence" with target word glowing. CTA: "Save this for later!"`,

  "superpower": `
FORMAT: Rule as Superpower Metaphor
Structure:
- 0-5s: Hook — stickman in cape + glowing grammar rule text + voice: "This tiny rule gives you SUPERPOWERS!"
- 5-20s: Villain (wrong version) appears and causes chaos
- 20-40s: Hero applies the rule — dramatic power-up sequence, rule text becomes glowing weapon/shield
- 40-55s: Before/after world transformation (grey → colourful) — 3 real-life quick wins
- 55-70s: Stickman flies off screen + "You now have the power! Subscribe for more."`,
};

/**
 * Generate one script via Claude API.
 * @param {Object} params - { format, topic, level, hooks }
 * @returns {Object} script JSON
 */
export async function generateScript({ format, topic, level, hooks = [] }) {
  const formatInstruction = FORMAT_INSTRUCTIONS[format] || FORMAT_INSTRUCTIONS.fail_fix;

  const userPrompt = `
${formatInstruction}

TOPIC: ${topic}
LEVEL: ${level}
VIRAL HOOKS TO DRAW FROM: ${hooks.slice(0, 5).join(" | ")}

COLOUR RULES:
- Wrong/fail text: red (#FF3B30)
- Correct/win text: green (#34C759)
- Background: white or #F0F8FF (pastel blue) for fail_fix and superpower; dark (#0D0D0D) for word_explosion
- Stickman: blue (#1F8EF1)

Output ONLY this JSON structure (no markdown, no prose):
{
  "video_id": "vid_${Date.now()}",
  "format": "${format}",
  "topic": "${topic}",
  "level": "${level}",
  "video_title": "...",
  "hook_text": "...",
  "storyboard": [
    {
      "time": "0-3s",
      "scene_description": "...",
      "on_screen_text": "...",
      "stickman_pose": "...",
      "text_color": "...",
      "background_color": "...",
      "effects": []
    }
  ],
  "script_lines": ["line 1", "line 2"],
  "voice_tone": "...",
  "call_to_action": "...",
  "youtube_title": "...",
  "youtube_description": "...",
  "youtube_tags": []
}`;

  logger.info(`[ScriptAgent] Generating ${format} script for: "${topic}" (${level})`);

  const response = await withRetry(
    () =>
      client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    3,
    2000,
    "ScriptAgent"
  );

  const raw = response.content[0].text.trim();
  let script;
  try {
    script = JSON.parse(raw);
  } catch (e) {
    // attempt to extract JSON from response if model added prose
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`ScriptAgent: Could not parse JSON from response.\n${raw}`);
    script = JSON.parse(match[0]);
  }

  logger.info(`[ScriptAgent] ✓ Script generated: "${script.video_title}"`);
  return script;
}

/**
 * Generate a full daily batch of scripts.
 * @param {Array} topics - Array of { format, topic, level } objects
 * @returns {Array} Array of script objects
 */
export async function generateDailyBatch(topics) {
  const VIRAL_HOOKS = [
    "You've been saying this WRONG your whole life 😱",
    "Native speakers NEVER say this — do you?",
    "This one word has 17 meanings 🔥",
    "Stop making this mistake RIGHT NOW",
    "This tiny rule makes you sound FLUENT instantly",
    "Grammar hack that schools never teach 🧠",
    "Watch until the end — your mind will be blown",
  ];

  const scripts = [];
  for (const topicConfig of topics) {
    try {
      const script = await generateScript({ ...topicConfig, hooks: VIRAL_HOOKS });
      scripts.push(script);
    } catch (err) {
      logger.error(`[ScriptAgent] Failed for topic "${topicConfig.topic}": ${err.message}`);
    }
  }

  const outputPath = path.join(PATHS.scripts, `${datestamp()}.json`);
  writeJSON(outputPath, { generated_at: new Date().toISOString(), scripts });
  logger.info(`[ScriptAgent] Saved ${scripts.length} scripts → ${outputPath}`);

  return scripts;
}
