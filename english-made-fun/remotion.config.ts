/**
 * remotion.config.ts
 * Remotion v4 configuration file.
 *
 * Docs: https://www.remotion.dev/docs/config
 *
 * This file is read by the Remotion CLI at build/preview time.
 * It is NOT bundled into the final video — it only affects the dev toolchain.
 */

import { Config } from "@remotion/cli/config";

// ── Entry point ───────────────────────────────────────────────────────────────
// Points to the file that calls registerRoot().
Config.setEntryPoint("./src/index.tsx");

// ── Webpack override ──────────────────────────────────────────────────────────
// Adds SVG support so .svg files can be imported as React components.
// Requires @svgr/webpack (already installed as devDependency).
//
// Use case: import { ReactComponent as Logo } from './assets/icons/logo.svg'
//           <Img src={staticFile('assets/icons/logo.svg')} />  ← no webpack needed
Config.overrideWebpackConfig((currentConfig) => {
  return {
    ...currentConfig,
    module: {
      ...currentConfig.module,
      rules: [
        // Keep all existing webpack rules, but exclude SVG from any
        // asset/resource or url-loader rules that Remotion registers by default.
        ...(currentConfig.module?.rules ?? []).map((rule) => {
          if (
            rule &&
            typeof rule === "object" &&
            !Array.isArray(rule) &&
            "test" in rule &&
            rule.test instanceof RegExp &&
            rule.test.source.includes("svg")
          ) {
            // Exclude SVG from any pre-existing rule that matches it
            return { ...rule, exclude: /\.svg$/i };
          }
          return rule;
        }),

        // @svgr/webpack: import SVG files as React components
        // Only applies when the importer is a JS/TS file (not CSS)
        {
          test: /\.svg$/i,
          issuer: /\.[jt]sx?$/,
          use: [
            {
              loader: require.resolve("@svgr/webpack"),
              options: {
                // Keep the SVG viewBox so scaling works correctly
                svgoConfig: {
                  plugins: [{ name: "removeViewBox", active: false }],
                },
              },
            },
          ],
        },
      ],
    },
  };
});

// ── Codec defaults ────────────────────────────────────────────────────────────
// H.264 is universally supported by YouTube and all major platforms.
// Note: setVideoCrf and setConcurrency were removed in Remotion v4 —
// pass --crf and --concurrency as CLI args or set them in renderMedia() calls.
Config.setCodec("h264");
