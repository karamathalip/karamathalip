/**
 * fonts.ts — Google Fonts loading via @remotion/google-fonts
 *
 * - Bangers: Bold, playful display font — headlines, labels, emphasis
 * - Inter: Clean, readable body font — examples, captions, descriptions
 * - Space Grotesk: Techy monospace-like — numbers, technical text
 */

import { loadFont as loadBangers } from "@remotion/google-fonts/Bangers";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";

const bangers = loadBangers();
const inter = loadInter("normal", {
  weights: ["400", "600", "700", "800", "900"],
  subsets: ["latin"],
});
const spaceGrotesk = loadSpaceGrotesk("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

export const fontBangers = bangers.fontFamily;
export const fontInter = inter.fontFamily;
export const fontSpaceGrotesk = spaceGrotesk.fontFamily;
