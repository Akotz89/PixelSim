/**
 * Vite Plugin: Auto-inject globals for Pixeldarium ESM migration
 * 
 * This plugin transforms classic script files into ES modules on-the-fly.
 * It wraps each file's code with:
 * 1. A globals import preamble (canvas, world, CONFIG, etc.)
 * 2. Module-scope compatibility shims
 * 
 * This allows the codebase to keep its existing PS.* namespace pattern
 * while Vite serves files as ES modules, enabling:
 * - Fallow dead code analysis via module graph
 * - Hot Module Replacement
 * - Tree shaking in production builds
 * 
 * Usage in vite.config.js:
 *   import { pixeldariumGlobals } from './vite-plugin-globals.js';
 *   export default { plugins: [pixeldariumGlobals()] };
 */

/**
 * The globals preamble is injected at the top of every transformed file.
 * It ensures all bare globals are available in module scope by referencing
 * them from the window object.
 */
const GLOBALS_PREAMBLE = `
// --- Vite auto-injected globals (pixeldarium-globals plugin) ---
const { PS } = window;
const { CONFIG } = window;
const { world, WORLD_WIDTH, WORLD_HEIGHT } = window;
const { canvas } = window;
`.trim();

function pixeldariumGlobals() {
  return {
    name: "pixeldarium-globals",
    
    transform(code, id) {
      // Only transform JS files in the project
      if (!id.endsWith(".js")) return null;
      if (id.includes("node_modules")) return null;
      if (id.includes("vite-plugin-globals")) return null;
      
      // Don't transform the namespace/loader bootstraps
      if (id.endsWith("namespace.js") || id.endsWith("loader.js") || id.endsWith("loader-esm.js")) {
        return null;
      }
      
      // Don't transform worker files
      if (id.includes("/workers/")) return null;
      
      // Inject globals preamble after "use strict" (if present)
      const strictRe = /^"use strict";\s*\n?/;
      let transformed;
      
      if (strictRe.test(code)) {
        transformed = code.replace(strictRe, GLOBALS_PREAMBLE + "\n\n");
      } else {
        transformed = GLOBALS_PREAMBLE + "\n\n" + code;
      }
      
      return {
        code: transformed,
        map: null, // No source map for now
      };
    },
  };
}

module.exports = { pixeldariumGlobals };
