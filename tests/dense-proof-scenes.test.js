const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const proofSceneSource = read("js/render/proof-scenes.js");
const proofSceneDoc = read("docs/proof-scene-acceptance.md");
const visualSpec = read("docs/google-earth-snake2d-visual-experience.md");
const packageJson = JSON.parse(read("package.json"));
const context = {
  PS: { render: {} },
  String,
  Number,
  Array,
  Object
};

vm.createContext(context);
vm.runInContext(proofSceneSource, context, { filename: "js/render/proof-scenes.js" });

assert.ok(
  manifestSource.indexOf("js/render/proof-scenes.js") > manifestSource.indexOf("js/render/lod.js") &&
    manifestSource.indexOf("js/render/proof-scenes.js") < manifestSource.indexOf("js/render/projection.js"),
  "proof scenes should load after LOD and before projection/pipeline consumers"
);

const manifest = context.PS.render.proofScenes.getManifest();
const scenes = context.PS.render.proofScenes.getAll();
const requiredFields = [
  "id",
  "title",
  "scale",
  "zoomBand",
  "camera",
  "visibleSimulationState",
  "watcherInterpretation",
  "activeRenderLayers",
  "requiredCausalFields",
  "expectedSemanticColors",
  "passFailCriteria",
  "evidenceArtifact",
  "verificationCommands",
  "acceptedAssets"
];

assert.strictEqual(manifest.schemaVersion, 1, "proof-scene manifest should be versioned");
assert.strictEqual(manifest.issue, "AZR-1074", "proof-scene manifest should link the Linear closeout issue");
assert.strictEqual(manifest.rendererContractVersion, 1, "proof scenes should consume the frame contract version");
assert.ok(manifest.runtimeBoundary.indexOf("no Agent Studio scripts") >= 0, "proof scenes should preserve runtime boundary");
assert.strictEqual(scenes.length, 3, "proof suite should define three canonical scale scenes");

["globe-continent-causal-context", "dense-local-settlement-readability", "actor-effect-readability"].forEach((id) => {
  assert.ok(context.PS.render.proofScenes.getById(id), "proof scene should exist: " + id);
});

scenes.forEach((scene) => {
  requiredFields.forEach((field) => {
    assert.ok(Object.prototype.hasOwnProperty.call(scene, field), scene.id + " missing " + field);
  });
  assert.ok(Number.isFinite(scene.camera.zoomLevel), scene.id + " should declare camera zoom");
  assert.ok(Number.isFinite(scene.camera.latitude), scene.id + " should declare camera latitude");
  assert.ok(Number.isFinite(scene.camera.longitude), scene.id + " should declare camera longitude");
  assert.ok(scene.visibleSimulationState.length >= 6, scene.id + " should name visible simulation state");
  assert.ok(scene.activeRenderLayers.length >= 4, scene.id + " should name active render layers");
  assert.ok(scene.requiredCausalFields.length >= 4, scene.id + " should name causal fields");
  assert.ok(scene.expectedSemanticColors.length >= 5, scene.id + " should name semantic color/layer expectations");
  assert.ok(scene.passFailCriteria.length >= 3, scene.id + " should name pass/fail criteria");
  assert.ok(scene.verificationCommands.some((command) => command.indexOf("tests/visual/screenshot.test.js") >= 0), scene.id + " should point to browser screenshot proof command");
  assert.ok(scene.acceptedAssets.every((asset) => asset.runtimeUse === true), scene.id + " should only reference runtime-usable assets/placeholders");
  assert.ok(scene.acceptedAssets.every((asset) => asset.provenance.indexOf("accepted runtime asset manifest") >= 0 || asset.provenance.indexOf("deterministic runtime simulation fields") >= 0), scene.id + " should state runtime-safe provenance");
});

const denseScene = context.PS.render.proofScenes.getById("dense-local-settlement-readability");
[
  "terrainMaterials",
  "buildings",
  "citizens",
  "stockpiles",
  "workStatus",
  "vegetation",
  "shadows",
  "particles",
  "lights",
  "worldUi"
].forEach((field) => {
  assert.ok(denseScene.visibleSimulationState.includes(field), "dense settlement scene should include " + field);
});

[
  "equivalence_terrain_materials_v0",
  "equivalence_settlement_structures_v0",
  "equivalence_resource_stockpiles_v0",
  "equivalence_creature_npc_refined_v1",
  "equivalence_work_status_overlays_v0",
  "equivalence_material_effect_overlays_v0",
  "equivalence_vegetation_scatter_v0"
].forEach((assetId) => {
  assert.ok(denseScene.acceptedAssets.some((asset) => asset.id === assetId), "dense settlement scene should reference " + assetId);
});

const actorScene = context.PS.render.proofScenes.getById("actor-effect-readability");
assert.ok(actorScene.visibleSimulationState.includes("organisms"), "actor scene should include organisms");
assert.ok(actorScene.visibleSimulationState.includes("food"), "actor scene should include food/resource state");
assert.ok(actorScene.visibleSimulationState.includes("intent"), "actor scene should include intent/status state");

const captureTargets = context.PS.render.proofScenes.getCaptureTargets();
assert.strictEqual(
  captureTargets.map((target) => target.expectedBand).sort().join(","),
  "continent,local,settlement",
  "capture targets should cover continent, local, and settlement bands"
);
assert.ok(
  captureTargets.every((target) => target.semanticColors.length >= 5 && target.activeRenderLayers.length >= 4),
  "capture targets should carry semantic and layer expectations"
);

assert.ok(
  proofSceneDoc.indexOf("Canonical Dense Readability Suite") >= 0 &&
    proofSceneDoc.indexOf("js/render/proof-scenes.js") >= 0,
  "proof-scene doc should describe the canonical suite"
);
assert.ok(
  visualSpec.indexOf("AZR-1074") >= 0 && visualSpec.indexOf("dense simulation readability proof-scene suite") >= 0,
  "visual spec should name the AZR-1074 implementation sequence"
);
assert.ok(
  packageJson.scripts.test.indexOf("tests/dense-proof-scenes.test.js") >= 0,
  "npm test should include dense proof-scene checks"
);

console.log("dense proof scene checks passed");
