const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

const globeWgsl = read("shaders/globe-sphere.wgsl");
const globeSidecar = read("shaders/globe-sphere.wgsl.js");
const globeRenderer = read("js/render/webgpu-globe.js");

assert.ok(globeWgsl.includes("sun_direction: vec4<f32>"), "globe uniforms should carry sun direction and render alpha");
assert.ok(globeWgsl.includes("lighting: vec4<f32>"), "globe uniforms should carry the shared lighting-cycle intensity fields");
assert.ok(globeWgsl.includes("ambient_color: vec4<f32>"), "globe uniforms should carry the shared ambient tint");
assert.ok(globeWgsl.includes("let sun_dir = normalize(globe.sun_direction.xyz)"), "globe shader should normalize the sun direction vector");
assert.ok(globeWgsl.includes("let diffuse = max(dot(normal, sun_dir), 0.0)"), "globe daylight should use normal dot sun direction");
assert.ok(globeWgsl.includes("ambient_hue_tint"), "globe shader should use the same luminance-normalized ambient hue model as tiles");
assert.ok(globeWgsl.includes("surface_exposure"), "globe shader should use the same exposure term as the tile compositor");
assert.strictEqual(globeWgsl.includes("let daylight = clamp"), false, "globe shader should not use independent daylight scalar");
assert.ok(globeWgsl.includes("let terminator = smoothstep"), "globe shader should model the day/night terminator");
assert.ok(globeWgsl.includes("ATMOSPHERE_BLUE"), "globe shader should include atmospheric limb color");
assert.ok(globeWgsl.includes("TERMINATOR_WARM"), "globe shader should include warm terminator tint");
assert.ok(globeWgsl.includes("let rayleigh ="), "globe shader should include limb/rayleigh atmosphere contribution");
assert.ok(globeWgsl.includes("let specular ="), "globe shader should include directional ocean specular response");
assert.ok(globeWgsl.includes("let render_alpha = clamp(globe.sun_direction.w"), "globe alpha fade should be packed with the sun uniform");
assert.ok(globeWgsl.includes("return vec4<f32>(color, render_alpha)"), "globe shader should emit render alpha instead of opaque color");
assert.ok(
  globeWgsl.includes("halo * 0.38 * render_alpha), render_alpha"),
  "globe atmosphere halo should fade with the same output alpha"
);
assert.strictEqual(
  globeWgsl.includes("0.50 + z * 0.54 - nx * 0.07 + ny * 0.035"),
  false,
  "globe shader must not use the old fake daylight scalar"
);

assert.ok(globeSidecar.includes("PS.assets.registerText(\"shaders/globe-sphere.wgsl\""), "globe WGSL sidecar should register shader text");
assert.ok(globeSidecar.includes("sun_direction: vec4<f32>"), "globe WGSL sidecar should include current sun-direction shader source");
assert.ok(globeSidecar.includes("lighting: vec4<f32>"), "globe WGSL sidecar should include shared lighting-cycle uniforms");
assert.ok(globeSidecar.includes("let diffuse = max(dot(normal, sun_dir), 0.0)"), "globe WGSL sidecar should include directional lighting source");
assert.ok(globeSidecar.includes("return vec4<f32>(color, render_alpha)"), "globe WGSL sidecar should include alpha-output shader source");

assert.ok(globeRenderer.includes("getSunDirection"), "WebGPU globe renderer should compute a sun direction");
assert.ok(globeRenderer.includes("data[12] = sun.x"), "globe uniform data should write sun direction x");
assert.ok(globeRenderer.includes("data[13] = sun.y"), "globe uniform data should write sun direction y");
assert.ok(globeRenderer.includes("data[14] = sun.z"), "globe uniform data should write sun direction z");
assert.ok(globeRenderer.includes("data[15] = Math.max(0, Math.min(1, spec.alpha"), "globe uniform data should write render alpha");
assert.ok(globeRenderer.includes("lightingCycle.getState"), "globe renderer should use the shared lighting cycle");
assert.ok(globeRenderer.includes("data[16] = spec.ambient"), "globe uniform data should write ambient intensity");
assert.ok(globeRenderer.includes("data[20] = Math.max"), "globe uniform data should write ambient tint");
assert.ok(globeRenderer.includes('srcFactor: "src-alpha"'), "globe pipeline should enable source alpha blending");
assert.ok(globeRenderer.includes('dstFactor: "one-minus-src-alpha"'), "globe pipeline should blend globe fade over existing color");

console.log("globe lighting checks passed");
