const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const namespaceSource = fs.readFileSync(path.join(root, "js/core/namespace.js"), "utf8");
const targetsSource = fs.readFileSync(path.join(root, "js/render/webgpu-targets.js"), "utf8");

assert.ok(
  namespaceSource.indexOf("js/render/webgpu-targets.js") > namespaceSource.indexOf("js/render/wgsl-shader-manager.js"),
  "WebGPU targets should load after the WGSL manager"
);
assert.ok(
  namespaceSource.indexOf("js/render/webgpu-targets.js") < namespaceSource.indexOf("js/render/webgpu-renderer.js"),
  "WebGPU targets should load before the WebGPU renderer"
);
assert.strictEqual(namespaceSource.indexOf("js/render/gl.js"), -1, "runtime manifest must not load the legacy WebGL bootstrap");

const context = {
  PS: {
    render: {},
    gpu: {
      format: "rgba8unorm"
    }
  },
  Object,
  String,
  Number,
  Math,
  Error
};

vm.createContext(context);
vm.runInContext(targetsSource, context, { filename: "js/render/webgpu-targets.js" });

const fakeDevice = {
  textures: [],
  createTexture(descriptor) {
    const texture = {
      descriptor,
      destroyed: false,
      viewCount: 0,
      destroy() {
        this.destroyed = true;
      },
      createView() {
        this.viewCount += 1;
        return { texture: this };
      }
    };
    this.textures.push(texture);
    return texture;
  }
};

const target = context.PS.render.webgpuTargets.create("frame", 320, 180, null, 16, fakeDevice);
const view = context.PS.render.webgpuTargets.getView("frame");
const secondView = context.PS.render.webgpuTargets.getView("frame");

assert.strictEqual(target.id, "frame", "target id should be stored");
assert.strictEqual(target.width, 320, "target width should be stored");
assert.strictEqual(target.height, 180, "target height should be stored");
assert.strictEqual(target.format, "rgba8unorm", "target should default to PS.gpu.format");
assert.strictEqual(target.usage, 16, "target usage should be stored");
assert.strictEqual(view, secondView, "target views should be cached");
assert.strictEqual(target.texture.viewCount, 1, "cached target views should not be recreated");

const unchanged = context.PS.render.webgpuTargets.resize("frame", 320, 180, fakeDevice);
assert.strictEqual(unchanged.texture, target.texture, "same-size resize should keep texture");

const resized = context.PS.render.webgpuTargets.resize("frame", 640, 360, fakeDevice);
assert.notStrictEqual(resized.texture, target.texture, "changed-size resize should recreate texture");
assert.strictEqual(target.texture.destroyed, true, "changed-size resize should destroy old texture");
assert.strictEqual(resized.width, 640, "resized target should store new width");
assert.strictEqual(resized.height, 360, "resized target should store new height");

context.PS.render.webgpuTargets.destroy("frame");
assert.strictEqual(resized.texture.destroyed, true, "destroy should destroy active texture");
assert.strictEqual(context.PS.render.webgpuTargets.get("frame"), null, "destroy should remove target");

console.log("webgpu target checks passed");
