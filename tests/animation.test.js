const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const animationData = JSON.parse(read("data/animations.json"));
const animationSource = read("js/core/animation.js");
const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const mainLoopSource = read("js/main-loop.js");

assert.ok(animationData.animations.organism, "animation data should define organism states");
assert.strictEqual(animationData.animations.organism.walk_right.fps, 8, "walk_right should run at 8fps");
assert.ok(animationData.animations.settlement, "animation data should define settlement states");
assert.ok(animationData.animations.vegetation, "animation data should define vegetation states");
assert.ok(manifestSource.indexOf("js/core/animation.js") >= 0, "runtime manifest should load animation core");
assert.ok(mainLoopSource.indexOf('loader.loadJSON("data/animations.json")') >= 0, "startup should load animation data");
assert.ok(mainLoopSource.indexOf("PS.animation.loadDefinitions") >= 0, "startup should register animation definitions");
assert.ok(animationSource.indexOf("getVisibleOrganismFrame") >= 0, "animation runtime should expose visible organism frame resolution");
assert.ok(animationSource.indexOf("updateVisibleOrganismFrames") >= 0, "animation runtime should update visible animation frames in a batch");
assert.ok(animationSource.indexOf("maxVisibleControllers") >= 0, "animation runtime should cap visible animation updates");
assert.strictEqual(manifestSource.indexOf("js/render/entity-webgl.js"), -1, "runtime manifest must not load the legacy entity WebGL renderer");
assert.strictEqual(animationSource.indexOf("getContext(\"2d\""), -1, "animation runtime must not use Canvas2D");

const context = {
  PS: { animation: {} },
  world: { isPaused: false },
  performance,
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  Object,
  String,
  Number,
  Boolean,
  Array,
  Math,
  Map,
  Error
};

vm.createContext(context);
vm.runInContext(animationSource, context, { filename: "js/core/animation.js" });

const controller = new context.PS.animation.AnimationController();
controller.addState("idle", { frames: ["idle_0", "idle_1"], fps: 4, loop: true });
controller.addState("walk_right", { frames: ["walk_0", "walk_1", "walk_2", "walk_3"], fps: 8, loop: true });
controller.setState("walk_right");
assert.strictEqual(controller.getCurrentFrame(), "walk_0", "walk_right should start at first frame");
controller.update(0.125, {});
assert.strictEqual(controller.getCurrentFrame(), "walk_1", "8fps animation should advance after 125ms");
assert.strictEqual(controller.getCurrentProgress(), 1 / 3, "progress should report position through the animation");

controller.addTransition("walk_right", "idle", function(subject) {
  return !subject || subject.velocity === 0;
});
controller.evaluateTransitions({ velocity: 0 });
assert.strictEqual(controller.stateName, "idle", "auto-transition should move stopped organisms to idle");

const asepriteStates = context.PS.animation.AnimationDefinition.fromAseprite({
  frames: {
    "walk_0": { duration: 125 },
    "walk_1": { duration: 125 },
    "idle_0": { duration: 250 }
  },
  meta: {
    frameTags: [
      { name: "walk", from: 0, to: 1 },
      { name: "idle", from: 2, to: 2 }
    ]
  }
});
assert.deepStrictEqual(Array.from(asepriteStates.walk.frames), ["walk_0", "walk_1"], "Aseprite tags should become animation states");
assert.strictEqual(asepriteStates.walk.fps, 8, "Aseprite duration should derive fps");

context.PS.animation.loadDefinitions(animationData);
const organism = {
  representativeId: 42,
  x: 11,
  y: 10,
  prevX: 10,
  prevY: 10,
  directionX: 1,
  directionY: 0
};
assert.strictEqual(context.PS.animation.getOrganismState(organism), "walk_right", "moving organism should select walk_right");
assert.strictEqual(context.PS.animation.getOrganismFrame(organism, 0.125), "entity.organism_0.1", "organism animation should resolve next walk frame");

context.world.isPaused = true;
const pausedFrame = context.PS.animation.getOrganismFrame(organism, 0.125);
const pausedFrameAgain = context.PS.animation.getOrganismFrame(organism, 0.125);
assert.strictEqual(pausedFrameAgain, pausedFrame, "animation frame should not advance while world is paused");

context.world.isPaused = false;
const subjects = [];
for (let i = 0; i < 5000; i++) {
  subjects.push({
    poolIndex: i,
    x: 11,
    y: 10,
    prevX: 10,
    prevY: 10,
    directionX: 1,
    directionY: 0
  });
  context.PS.animation.updateVisibleOrganismFrame(subjects[i], 0);
}

const startedAt = performance.now();
const outputFrames = new Array(5000);
context.PS.animation.updateVisibleOrganismFrames(subjects, 5000, 1 / 60, outputFrames);
const elapsed = performance.now() - startedAt;
assert.ok(elapsed < 25, "5000 visible animation slots should avoid pathological VM cost, measured " + elapsed.toFixed(3) + "ms");
assert.ok(context.PS.animation.getStats().lastUpdateMs >= 0, "batch update should record timing for browser performance evidence");

console.log("animation system checks passed", JSON.stringify({ nodeVmBatchMs: Number(elapsed.toFixed(3)) }));
