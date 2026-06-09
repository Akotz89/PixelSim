const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const configSource = fs.readFileSync(path.join(root, "js/core/config.js"), "utf8");
const dataLoaderSource = fs.readFileSync(path.join(root, "js/core/data-loader.js"), "utf8");
const debugConsoleSource = fs.readFileSync(path.join(root, "js/debug/console.js"), "utf8");
const configData = JSON.parse(fs.readFileSync(path.join(root, "data/config.json"), "utf8"));
const configSidecarSource = fs.readFileSync(path.join(root, "data/config.json.js"), "utf8");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const context = {
  CONFIG: clone(configData.values),
  PS: {
    config: {},
    core: {},
    assets: {
      captured: {},
      registerJSON(url, data) {
        this.captured[url] = data;
      }
    },
    debug: {},
    ui: {
      notifications: {
        entries: [],
        show(title, body, type) {
          this.entries.push({ title, body, type });
        }
      }
    }
  },
  Object,
  Array,
  String,
  Number,
  Error,
  Promise,
  console
};

vm.createContext(context);
vm.runInContext(configSource, context, { filename: "js/core/config.js" });
vm.runInContext(dataLoaderSource, context, { filename: "js/core/data-loader.js" });
vm.runInContext(debugConsoleSource, context, { filename: "js/debug/console.js" });
vm.runInContext(configSidecarSource, context, { filename: "data/config.json.js" });

assert.strictEqual(configData.version, 1, "config data should declare schema version");
assert.ok(configData.values.MAX_FOOD > 0, "config data should include runtime values");
assert.deepStrictEqual(
  clone(context.PS.assets.captured["data/config.json"]),
  clone(configData),
  "config sidecar should match data/config.json"
);

const status = context.PS.core.DataLoader.applyConfig(configData);

assert.strictEqual(status.loaded, true, "DataLoader should mark config loaded");
assert.strictEqual(status.valueCount, Object.keys(configData.values).length, "DataLoader should report value count");
assert.strictEqual(context.CONFIG.MAX_FOOD, configData.values.MAX_FOOD, "CONFIG should receive data/config values");
assert.strictEqual(context.PS.config.food.maxCount, configData.values.MAX_FOOD, "PS.config food section should refresh from CONFIG");
assert.strictEqual(context.PS.config.sim.maxUpdatesPerFrame, configData.values.MAX_SIM_UPDATES_PER_FRAME, "PS.config sim section should refresh from CONFIG");

assert.throws(
  () => context.PS.core.DataLoader.validateConfig({ version: 1, values: { MAX_FOOD: "many" } }),
  /values.CANVAS_WIDTH is required/,
  "config validation should catch missing required values"
);

assert.throws(
  () => context.PS.core.DataLoader.validateConfig({
    version: 1,
    values: Object.assign({}, configData.values, { MAX_FOOD: "many" })
  }),
  /MAX_FOOD must be number/,
  "config validation should catch wrong types"
);

assert.strictEqual(context.PS.debug.console.run("get CONFIG.MAX_FOOD"), configData.values.MAX_FOOD, "debug console should get config values");
assert.strictEqual(context.PS.debug.console.run("set CONFIG.MAX_FOOD 999"), 999, "debug console should set config values");
assert.strictEqual(context.CONFIG.MAX_FOOD, 999, "set command should update CONFIG");
assert.strictEqual(context.PS.config.food.maxCount, 999, "set command should refresh PS.config projections");

context.PS.assets.startupLoader = {
  loadJSON(url) {
    assert.strictEqual(url, "data/config.json", "reset should reload data/config.json");
    return Promise.resolve(configData);
  }
};

Promise.resolve(context.PS.debug.console.run("reset CONFIG")).then(() => {
  assert.strictEqual(context.CONFIG.MAX_FOOD, configData.values.MAX_FOOD, "reset command should restore data/config value");
  assert.strictEqual(context.PS.config.food.maxCount, configData.values.MAX_FOOD, "reset command should refresh config projections");
  console.log("config data loader checks passed");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
