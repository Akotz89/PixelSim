#!/usr/bin/env node
"use strict";
const { execSync } = require("child_process");
const path = require("path");

const tests = [
  "script-manifest", "script-loader", "runtime-health",
  "prng", "noise", "bitsmap", "heat-diffusion", "event-system",
  "phase0-core-unit", "pools", "biome-lut", "epoch-scaling",
  "coupling", "geochemistry", "molecular-dynamics", "lenia",
  "moisture", "pixel-ca", "reaction-diffusion", "thermohaline",
  "lbm-ocean", "tile-registry", "entity-registry", "animation",
  "input-manager", "audio-system", "asset-loader", "config-data-loader",
  "terrain-transitions", "render-palette-registry", "tile-biome-data",
  "camera-unified", "render-layer-order", "render-iterator",
  "webgpu-mandate", "gpu-bootstrap", "wgsl-shader-manager",
  "wgsl-uniform-layout", "shader-manager", "webgpu-targets",
  "webgpu-pipeline", "webgpu-gbuffer-compositor",
  "webgpu-tile-lights", "webgpu-point-lights", "lighting-cycle",
  "webgpu-water-displacement", "webgpu-entity", "webgpu-globe-surface",
  "globe-lighting", "webgpu-surface-tile", "lod-layer-alpha",
  "surface-render-fallback", "compute-harness",
  "parameter-provenance", "simulation-causality-audit",
  "sim-control", "wasm-sim", "wasm-worker-bridge",
  "sprite-sheet", "sprite-sheet-material", "asset-manifest",
  "shore-transitions", "equivalence-assets",
  "minimap-visual", "vegetation-grid", "vegetation-placement",
  "shadow-stamping", "mountain-render", "vegetation-render",
  "environment-overlays", "art-bible",
  "ui-component-system", "hud-scale-cue", "save-migration",
  "persistence-schema", "persistence-pool-roundtrip",
  "simulation-cycle", "settlement-progression", "predation",
  "food-web", "resource-registry", "organism-ai",
  "organism-update-path", "terrain-driven-evolution",
  "speciation-events", "mass-extinction", "lineage-tracking",
  "timeline-viewer", "statistics-dashboard", "bookmarks",
  "evolutionary-tree", "export-capture", "time-compression-ui",
  "body-traits-behavior", "ui-architecture",
  "world-gen-golden", "render-iterator",
  "no-canvas2d-runtime", "no-canvas2d-source",
  "renderer-interface", "entity-atlas",
  "terrain-civilization-atlas", "organism-atlas-identity",
  "morphological-rendering", "particles",
  "time-accumulator", "frame-budget-monitor",
  "representatives-performance"
];

let pass = 0;
let fail = 0;
const failures = [];

for (const t of tests) {
  const file = path.join("tests", `${t}.test.js`);
  try {
    execSync(`node ${file}`, { stdio: "pipe", timeout: 30000 });
    pass++;
  } catch (e) {
    fail++;
    const stderr = (e.stderr || "").toString().split("\n")[0];
    failures.push(`  ${t}: ${stderr}`);
  }
}

console.log(`\nResults: ${pass} PASS, ${fail} FAIL out of ${tests.length}`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(f));
}
