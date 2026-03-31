// pipeline/visual_agent.js
// Agent 9: Plans animation blueprint, thumbnail prompt, and image prompts per video
import Anthropic from "@anthropic-ai/sdk";
import { logger, withRetry } from "./utils.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FORMAT_VISUAL_DEFAULTS = {
  fail_fix: {
    background_color: "#F0F8FF",
    stickman_color: "#1F8EF1",
    particle_effects: ["confetti", "red_x", "green_check"],
    camera_motion: "subtle_zoom_in",
    transitions: ["screen_wipe", "flash"],
  },
  word_explosion: {
    background_color: "#0D0D0D",
    stickman_color: "#1F8EF1",
    particle_effects: ["explosion", "neon_glow", "confetti"],
    camera_motion: "shake_on_impact",
    transitions: ["explosion_burst", "fade"],
  },
  superpower: {
    background_color: "#FFF9F0",
    stickman_color: "#1F8EF1",
    particle_effects: ["speed_lines", "glow_rings", "power_surge"],
    camera_motion: "dramatic_zoom",
    transitions: ["colour_shift", "flash"],
  },
};

/**
 * Generate visual blueprint for a script.
 */
export async function generateVisualBlueprint(script) {
  const { format, video_title, hook_text, storyboard, topic } = script;

  const prompt = `
You are an animation director for YouTube educational Shorts.

SCRIPT SUMMARY:
- Title: ${video_title}
- Format: ${format}
- Topic: ${topic}
- Hook: ${hook_text}
- Number of scenes: ${storyboard.length}

Generate a JSON visual blueprint. Image prompts must be for Stable Diffusion — short, vivid, specific.
Max 2 image prompts (prioritise the hook scene and the payoff/win scene only).

Output ONLY this JSON:
{
  "animation_blueprint": {
    "background_color": "hex color",
    "stickman_color": "#1F8EF1",
    "particle_effects": ["effect1", "effect2"],
    "camera_motion": "subtle_zoom_in | shake_on_impact | dramatic_zoom | static",
    "transitions": ["screen_wipe", "flash", "fade"]
  },
  "thumbnail_prompt": "vivid 20-word DALL-E prompt for YouTube thumbnail — bold text, stickman, high emotion",
  "image_prompts": [
    "stable diffusion prompt for scene 1 (hook)",
    "stable diffusion prompt for final payoff scene"
  ]
}`;

  logger.info(`[VisualAgent] Planning blueprint for: "${video_title}"`);

  try {
    const response = await withRetry(
      () =>
        client.messages.create({
          model: "claude-opus-4-5",
          max_tokens: 600,
          system: "You are a visual director. Output ONLY valid JSON, no prose.",
          messages: [{ role: "user", content: prompt }],
        }),
      3,
      2000,
      "VisualAgent"
    );

    const raw = response.content[0].text.trim();
    let blueprint;
    try {
      blueprint = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      blueprint = match ? JSON.parse(match[0]) : null;
    }

    if (!blueprint) throw new Error("Failed to parse blueprint JSON");

    logger.info(`[VisualAgent] ✓ Blueprint ready for: "${video_title}"`);
    return blueprint;
  } catch (err) {
    logger.warn(`[VisualAgent] AI blueprint failed, using format defaults: ${err.message}`);
    return {
      animation_blueprint: FORMAT_VISUAL_DEFAULTS[format] || FORMAT_VISUAL_DEFAULTS.fail_fix,
      thumbnail_prompt: `English learning animated stickman: "${hook_text}" — bold text, high emotion, YouTube Short`,
      image_prompts: [
        `confused stickman character making grammar mistake, cartoon flat style, high contrast`,
        `celebrating stickman character success, confetti, bright colors, cartoon flat style`,
      ],
    };
  }
}
