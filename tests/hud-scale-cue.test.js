const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const foundationSource = read("js/ui/foundation.js");
const cameraSource = read("js/render/camera.js");
const styleSource = read("style.css");
const packageJson = JSON.parse(read("package.json"));

assert.ok(
  foundationSource.indexOf("PS.camera.getScaleBar(180)") >= 0,
  "HUD should build its visual scale cue from PS.camera.getScaleBar"
);
assert.ok(
  foundationSource.indexOf("getPlanetCameraScaleInfo()") >= 0,
  "HUD should keep using camera scale info for ground-pixel and footprint metrics"
);
assert.ok(
  foundationSource.indexOf("function makeHudScaleCue") >= 0,
  "HUD should expose a dedicated scale cue helper"
);
assert.ok(
  foundationSource.indexOf('class=\\"hud-scale-cue\\"') >= 0 ||
    foundationSource.indexOf('class="hud-scale-cue"') >= 0,
  "HUD scale cue should render a stable root class"
);
assert.ok(
  foundationSource.indexOf('class=\\"hud-scale-bar\\"') >= 0 ||
    foundationSource.indexOf('class="hud-scale-bar"') >= 0,
  "HUD scale cue should include a visual bar element"
);
assert.ok(
  foundationSource.indexOf("safeInfo.scaleName") >= 0 &&
    foundationSource.indexOf("metersPerCanvasPixel") >= 0,
  "HUD scale cue should publish scale name and ground-pixel metric"
);
assert.ok(
  foundationSource.indexOf("makeHudScaleCue(planetScaleInfo, planetScaleBar)") <
    foundationSource.indexOf('makeHudMetric("Zoom"'),
  "scale cue should appear before dense text-only zoom metrics"
);
assert.ok(
  cameraSource.indexOf("PS.camera.getScaleBar") >= 0 &&
    cameraSource.indexOf("getNiceDistanceMeters") >= 0,
  "camera should own scale-bar distance calculation"
);
assert.ok(
  styleSource.indexOf(".hud-scale-cue") >= 0 &&
    styleSource.indexOf(".hud-scale-bar") >= 0 &&
    styleSource.indexOf(".hud-scale-meta") >= 0,
  "style.css should define compact HUD scale cue styles"
);
assert.ok(
  packageJson.scripts.test.indexOf("node tests/hud-scale-cue.test.js") >= 0,
  "npm test should include the HUD scale cue regression test"
);

console.log("HUD scale cue checks passed");
