// pipeline/viral_agent.js
// Agent 2: Scores scripts for viral potential. Rejects below threshold.
import Anthropic from "@anthropic-ai/sdk";
import { logger, withRetry } from "./utils.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a viral content analyst specialising in short-form educational YouTube videos.
You predict viral potential with precision. Output ONLY valid JSON — no prose, no markdown.`;

const THRESHOLD = parseInt(process.env.VIRAL_SCORE_THRESHOLD || "60", 10);

/**
 * Score a single script for viral potential.
 * @param {Object} script - Script JSON from ScriptAgent
 * @returns {Object} { script, viralResult, approved }
 */
export async function scoreScript(script) {
  const prompt = `
Analyse this YouTube Short script and predict its viral potential.

SCORING CRITERIA (weights must sum to 100):
- Hook strength (30%): Creates curiosity in <2 seconds? Emotion, surprise, or contradiction?
- Retention structure (25%): Scene changes every 3-6s, pattern interrupts, hook→tension→payoff?
- Emotional impact (15%): Humor, surprise, satisfaction, relatability?
- Clarity (10%): Instantly understandable, zero cognitive overload?
- Shareability (10%): "Tag a friend" potential? Relatable mistake or surprising fact?
- Novelty (10%): Unique angle or presentation?

DECISION RULES:
- Score ≥ 80 → "produce" (green-light immediately)
- Score 60-79 → "revise" (produce with improvements applied)
- Score < 60 → "reject"

INPUT SCRIPT:
${JSON.stringify(script, null, 2)}

Output ONLY this JSON:
{
  "viral_score": <0-100>,
  "hook_score": <0-100>,
  "retention_score": <0-100>,
  "emotional_score": <0-100>,
  "clarity_score": <0-100>,
  "shareability_score": <0-100>,
  "novelty_score": <0-100>,
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "improvement_suggestions": ["...", "..."],
  "revised_hook_text": "...",
  "revised_title": "...",
  "decision": "produce | revise | reject"
}`;

  logger.info(`[ViralAgent] Scoring: "${script.video_title}"`);

  const response = await withRetry(
    () =>
      client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    3,
    2000,
    "ViralAgent"
  );

  const raw = response.content[0].text.trim();
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`ViralAgent: Could not parse JSON.\n${raw}`);
    result = JSON.parse(match[0]);
  }

  const approved = result.viral_score >= THRESHOLD;
  const emoji = result.decision === "reject" ? "❌" : result.decision === "revise" ? "⚠️" : "✅";

  logger.info(
    `[ViralAgent] ${emoji} Score: ${result.viral_score}/100 — ${result.decision.toUpperCase()} — "${script.video_title}"`
  );

  // Apply AI-suggested improvements to script if "revise"
  if (result.decision === "revise") {
    if (result.revised_hook_text) script.hook_text = result.revised_hook_text;
    if (result.revised_title) {
      script.video_title = result.revised_title;
      script.youtube_title = result.revised_title;
    }
    logger.info(`[ViralAgent] Applied revisions to script for "${script.video_title}"`);
  }

  return { script, viralResult: result, approved };
}

/**
 * Filter a batch of scripts — return only approved ones.
 * @param {Array} scripts
 * @returns {Array} approved scripts (with revisions applied)
 */
export async function filterBatch(scripts) {
  const results = [];
  for (const script of scripts) {
    const { script: revisedScript, viralResult, approved } = await scoreScript(script);
    if (approved) {
      results.push({ ...revisedScript, viralResult });
    } else {
      logger.warn(
        `[ViralAgent] Rejected: "${script.video_title}" (score: ${viralResult.viral_score})`
      );
    }
  }
  logger.info(
    `[ViralAgent] Approved ${results.length}/${scripts.length} scripts for production.`
  );
  return results;
}
