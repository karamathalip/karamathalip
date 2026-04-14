/**
 * config-generator.js — Generates WordVideoConfig JSON from pipeline outputs
 *
 * Reads:
 *   - Script JSON (from script_agent)
 *   - Voice durations (from voice_agent output directory)
 *
 * Outputs:
 *   - Complete WordVideoConfig JSON file
 *
 * Usage:
 *   node config-generator.js --script scripts/vid_010_break.json --audio audio/voice/ --output configs/break-config.json
 */

const fs = require("fs");
const path = require("path");

// ─── Word Form Detection ─────────────────────────────────────────────────────

/**
 * Get common conjugations/forms of a word for matching in sentences.
 * Covers regular English verb patterns.
 */
function getWordForms(word) {
  const base = word.toLowerCase();
  const forms = new Set([base]);

  // Common verb suffixes
  forms.add(base + "s");
  forms.add(base + "es");
  forms.add(base + "ed");
  forms.add(base + "ing");
  forms.add(base + "er");
  forms.add(base + "ers");

  // Handle silent-e verbs (make -> making, made)
  if (base.endsWith("e")) {
    forms.add(base.slice(0, -1) + "ing");
    forms.add(base.slice(0, -1) + "ed");
  }

  // Handle consonant doubling (run -> running)
  if (/[aeiou][bcdfghlmnprstvwz]$/.test(base)) {
    const last = base[base.length - 1];
    forms.add(base + last + "ing");
    forms.add(base + last + "ed");
  }

  // Common irregular forms for known words
  const irregulars = {
    make: ["made", "makes", "making"],
    break: ["broke", "breaks", "breaking", "broken"],
    take: ["took", "takes", "taking", "taken"],
    get: ["got", "gets", "getting", "gotten"],
    run: ["ran", "runs", "running"],
    set: ["sets", "setting"],
    cut: ["cuts", "cutting"],
    put: ["puts", "putting"],
    let: ["lets", "letting"],
    give: ["gave", "gives", "giving", "given"],
    go: ["went", "goes", "going", "gone"],
    come: ["came", "comes", "coming"],
    see: ["saw", "sees", "seeing", "seen"],
    know: ["knew", "knows", "knowing", "known"],
    think: ["thought", "thinks", "thinking"],
    say: ["said", "says", "saying"],
    tell: ["told", "tells", "telling"],
    find: ["found", "finds", "finding"],
    leave: ["left", "leaves", "leaving"],
    feel: ["felt", "feels", "feeling"],
    keep: ["kept", "keeps", "keeping"],
    hold: ["held", "holds", "holding"],
    bring: ["brought", "brings", "bringing"],
    stand: ["stood", "stands", "standing"],
    turn: ["turned", "turns", "turning"],
    play: ["played", "plays", "playing"],
  };

  if (irregulars[base]) {
    irregulars[base].forEach((f) => forms.add(f));
  }

  return Array.from(forms);
}

/**
 * Check if a word (cleaned) matches any form of the target word.
 */
function isWordForm(wordRaw, targetWord) {
  const clean = wordRaw.replace(/[^a-zA-Z']/g, "").toLowerCase();
  const forms = getWordForms(targetWord.toLowerCase());
  return forms.some((f) => clean === f);
}

// ─── Sentence Tokenizer ──────────────────────────────────────────────────────

/**
 * Tokenize a sentence, detecting target word forms and assigning meaning colors.
 */
function tokenizeSentence(sentence, targetWord, meanings, defaultTextColor) {
  const words = sentence.split(/\s+/);
  let meaningCounter = 0;

  return words.map((word) => {
    if (isWordForm(word, targetWord)) {
      const meaningIdx = Math.min(meaningCounter, meanings.length - 1);
      meaningCounter++;
      return {
        word,
        color: meanings[meaningIdx]?.color ?? defaultTextColor,
        meaningLabel: meanings[meaningIdx]?.label,
        meaningIndex: meaningIdx,
      };
    }
    return { word, color: defaultTextColor };
  });
}

// ─── Constellation Position Generator ─────────────────────────────────────────

/**
 * Generate evenly-spaced constellation node positions for N meanings.
 */
function generateConstellationPositions(count, centerX = 540, centerY = 680) {
  const radius = 250;
  const startAngle = -Math.PI / 2; // Start from top

  return Array.from({ length: count }, (_, i) => {
    const angle = startAngle + (i / count) * Math.PI * 2;
    return {
      x: Math.round(centerX + Math.cos(angle) * radius),
      y: Math.round(centerY + Math.sin(angle) * radius - 100),
    };
  });
}

// ─── Scene Duration Calculator ────────────────────────────────────────────────

/**
 * Compute frame-exact scene duration from voice clip.
 */
function computeSceneDuration(voiceDurationSec, fps, bufferFrames = 12) {
  return Math.ceil(voiceDurationSec * fps) + bufferFrames;
}

// ─── Main Config Generator ────────────────────────────────────────────────────

/**
 * Generate a complete WordVideoConfig from script JSON.
 *
 * @param {Object} script - Script JSON from script_agent
 * @param {Object} voiceDurations - Map of scene_id -> duration in seconds
 * @param {Object} options - Additional options
 * @returns {Object} WordVideoConfig
 */
function generateConfig(script, voiceDurations = {}, options = {}) {
  const {
    fps = 60,
    width = 1080,
    height = 1920,
    voiceDelayFrames = 12,
  } = options;

  const targetWord = script.targetWord || script.topic?.split(" ")[0] || "WORD";
  const meanings = script.meanings || [];

  // Default color palette
  const defaultColors = ["#ff2d78", "#ffe600", "#39ff14", "#ff8800", "#9944ff"];
  meanings.forEach((m, i) => {
    if (!m.color) m.color = defaultColors[i % defaultColors.length];
  });

  const colors = script.colors || {
    bg: "#0d0d1a",
    bgLight: "#141428",
    primary: "#00d4ff",
    text: "#ffffff",
    textDim: "#8888aa",
    hero: "#f7c948",
    stickman: "#ffffff",
    meanings: meanings.map((m) => m.color),
  };

  // Build scenes from script storyboard
  const scenes = [];

  // Scene 1: Hook
  if (script.hookSentence) {
    const hookTokens = tokenizeSentence(
      script.hookSentence,
      targetWord,
      meanings,
      colors.text
    );
    const replacementMap = {};
    hookTokens.forEach((tok, i) => {
      if (tok.meaningLabel) {
        replacementMap[i] = tok.meaningLabel;
      }
    });

    const hookDuration = voiceDurations.hook
      ? computeSceneDuration(voiceDurations.hook, fps)
      : 421;

    scenes.push({
      id: "hook",
      type: "hook",
      durationFrames: hookDuration,
      voiceLine: script.voiceLines?.hook
        ? {
            text: script.voiceLines.hook,
            audioFile: "audio/voice/01_hook.mp3",
            durationSec: voiceDurations.hook || hookDuration / fps,
          }
        : undefined,
      sfxCues: [
        { cue: "typewriter_click", offsetSec: 0.3 },
        { cue: "record_scratch", offsetSec: 4.5 },
        { cue: "whoosh_slide", offsetSec: 6.0 },
      ],
      data: {
        type: "hook",
        accentColor: colors.primary,
        sentenceTokens: hookTokens,
        replacementMap,
        slamText: script.slamText || "WAIT.",
        slamColor: colors.hero,
        stickmanTransitions: [
          { timeSec: 0, pose: "idle", emotion: "neutral" },
          { timeSec: 1.5, pose: "confused", emotion: "confused" },
          { timeSec: 3.0, pose: "shocked", emotion: "wow" },
          { timeSec: 5.0, pose: "tracking", emotion: "wide_eyes" },
        ],
      },
    });
  }

  // Scenes 2-N: Meanings
  const meaningPoses = ["painting", "shoving", "cash", "pointing", "hero_pose"];
  const meaningEmotions = ["happy", "excited", "victorious", "wow", "excited"];
  const meaningSfx = ["sparkle_pop", "thud_impact", "cash_register", "whoosh_slide", "sparkle_pop"];

  meanings.forEach((meaning, i) => {
    const sceneId = `meaning_${i + 1}`;
    const dur = voiceDurations[sceneId]
      ? computeSceneDuration(voiceDurations[sceneId], fps)
      : 460;

    scenes.push({
      id: sceneId,
      type: "meaning",
      durationFrames: dur,
      voiceLine: script.voiceLines?.[sceneId]
        ? {
            text: script.voiceLines[sceneId],
            audioFile: `audio/voice/${String(i + 2).padStart(2, "0")}_${sceneId}.mp3`,
            durationSec: voiceDurations[sceneId] || dur / fps,
          }
        : undefined,
      sfxCues: [
        { cue: meaningSfx[i] || "sparkle_pop", offsetSec: 0.3 },
        { cue: "wrong_buzz", offsetSec: 2.0 },
        { cue: "correct_ding", offsetSec: 4.0 },
        { cue: "chip_reveal", offsetSec: 5.5 },
      ],
      data: {
        type: "meaning",
        targetWord: targetWord.toUpperCase(),
        meaning,
        stickmanPose: meaning.stickmanPose || meaningPoses[i] || "standing",
        stickmanEmotion: meaning.stickmanEmotion || meaningEmotions[i] || "happy",
      },
    });
  });

  // Explosion reveal scene
  const constellationPos = generateConstellationPositions(meanings.length);
  const explosionDur = voiceDurations.explosion_reveal
    ? computeSceneDuration(voiceDurations.explosion_reveal, fps)
    : 422;

  scenes.push({
    id: "explosion_reveal",
    type: "explosion_reveal",
    durationFrames: explosionDur,
    voiceLine: script.voiceLines?.explosion_reveal
      ? {
          text: script.voiceLines.explosion_reveal,
          audioFile: `audio/voice/${String(meanings.length + 2).padStart(2, "0")}_explosion.mp3`,
          durationSec: voiceDurations.explosion_reveal || explosionDur / fps,
        }
      : undefined,
    sfxCues: [
      { cue: "explode_pop", offsetSec: 0.1 },
      { cue: "constellation_draw", offsetSec: 2.0 },
      { cue: "glory_shimmer", offsetSec: 5.0 },
    ],
    data: {
      type: "explosion_reveal",
      targetWord: targetWord.toUpperCase(),
      accentColor: colors.primary,
      meanings: meanings.map((m, i) => ({
        text: m.label,
        color: m.color,
        x: constellationPos[i].x,
        y: constellationPos[i].y,
      })),
      centerPosition: { x: 540, y: 680 },
      stickmanPose: "cheering",
      stickmanEmotion: "victorious",
    },
  });

  // Mini story scene
  if (script.miniStorySentence) {
    const storyTokens = tokenizeSentence(
      script.miniStorySentence,
      targetWord,
      meanings,
      colors.text
    );
    // Add labels to target words
    const labeledTokens = storyTokens.map((tok) => ({
      ...tok,
      label: tok.meaningLabel,
    }));

    const storyDur = voiceDurations.mini_story
      ? computeSceneDuration(voiceDurations.mini_story, fps)
      : 439;

    scenes.push({
      id: "mini_story",
      type: "mini_story",
      durationFrames: storyDur,
      voiceLine: script.voiceLines?.mini_story
        ? {
            text: script.voiceLines.mini_story,
            audioFile: `audio/voice/${String(meanings.length + 3).padStart(2, "0")}_mini_story.mp3`,
            durationSec: voiceDurations.mini_story || storyDur / fps,
          }
        : undefined,
      sfxCues: [
        { cue: "color_flash", offsetSec: 1.0 },
        { cue: "color_flash", offsetSec: 3.0 },
        { cue: "color_flash", offsetSec: 5.0 },
      ],
      data: {
        type: "mini_story",
        title: "ALL " + meanings.length + " IN ONE SENTENCE:",
        bgAccent: "#6644aa",
        wordTokens: labeledTokens,
        stickmanPose: "nodding",
        stickmanEmotion: "happy",
      },
    });
  }

  // Loop back scene
  if (script.loopBackSentence) {
    const loopTokens = tokenizeSentence(
      script.loopBackSentence,
      targetWord,
      meanings,
      colors.text
    );
    const targetCount = loopTokens.filter((t) => t.meaningLabel).length;

    const loopDur = voiceDurations.loop_back
      ? computeSceneDuration(voiceDurations.loop_back, fps)
      : 354;

    scenes.push({
      id: "loop_back",
      type: "loop_back",
      durationFrames: loopDur,
      voiceLine: script.voiceLines?.loop_back
        ? {
            text: script.voiceLines.loop_back,
            audioFile: `audio/voice/${String(meanings.length + 4).padStart(2, "0")}_loop_back.mp3`,
            durationSec: voiceDurations.loop_back || loopDur / fps,
          }
        : undefined,
      sfxCues: [
        { cue: "typewriter_click", offsetSec: 0.3 },
        { cue: "question_ping", offsetSec: 4.0 },
        { cue: "bass_drop", offsetSec: 5.4 },
      ],
      data: {
        type: "loop_back",
        title: "ONE MORE.",
        titleColor: colors.hero,
        accentColor: colors.primary,
        sentenceTokens: loopTokens,
        questionText: `HOW MANY ${targetWord.toUpperCase()}s?`,
        challengeText: "COUNT AGAIN.",
        challengeColor: colors.hero,
        stickmanPose: "pointing_up",
        stickmanEmotionBefore: "wide_eyes",
        stickmanEmotionAfter: "excited",
      },
    });
  }

  return {
    videoId: script.videoId || `vid_${targetWord.toLowerCase()}`,
    format: "word_explosion",
    targetWord: targetWord.toUpperCase(),
    topic: script.topic || `The word ${targetWord} and its meanings`,
    level: script.level || "B1",
    colors,
    fps,
    width,
    height,
    voiceDelayFrames,
    meanings,
    scenes,
    youtube: script.youtube || {
      title: `${targetWord.toUpperCase()} Has ${meanings.length} HIDDEN Meanings`,
      description: `Learn all ${meanings.length} meanings of ${targetWord} with examples.`,
      tags: ["english", "vocabulary", targetWord.toLowerCase()],
    },
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const scriptPath = args[args.indexOf("--script") + 1];
  const outputPath = args[args.indexOf("--output") + 1] || "config.json";

  if (!scriptPath) {
    console.log("Usage: node config-generator.js --script <path> [--output <path>]");
    console.log("\nThe script JSON should have:");
    console.log("  targetWord, meanings[], hookSentence, miniStorySentence, loopBackSentence");
    process.exit(1);
  }

  const script = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  const config = generateConfig(script);

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
  console.log(`Config generated: ${outputPath}`);
  console.log(`  Word: ${config.targetWord}`);
  console.log(`  Meanings: ${config.meanings.length}`);
  console.log(`  Scenes: ${config.scenes.length}`);
  console.log(`  Total frames: ${config.scenes.reduce((s, sc) => s + sc.durationFrames, 0)}`);
}

module.exports = { generateConfig, tokenizeSentence, getWordForms, generateConstellationPositions };
