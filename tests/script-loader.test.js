require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const loaderSource = fs.readFileSync(path.join(root, "js/core/loader.js"), "utf8");

function createContext(manifest, options) {
  const appended = [];
  const debugMessages = [];
  const runtimeErrors = [];
  const settings = options || {};
  const context = {
    window: {
      PS: {
        core: {
          manifest: manifest.slice()
        },
        runtime: {
          recordError: function(kind, payload) {
            runtimeErrors.push({ kind: kind, payload: payload });
          }
        }
      }
    },
    document: {
      createElement: function(tagName) {
        assert.strictEqual(tagName, "script", "loader should create script tags");
        return {};
      },
      head: {
        appendChild: function(script) {
          appended.push(script);

          if (settings.failAt === script.src) {
            script.onerror({ error: new Error("missing file") });
            return script;
          }

          script.onload();
          return script;
        }
      }
    },
    showDebugMessage: function(message) {
      debugMessages.push(message);
    },
    Promise: Promise,
    Error: Error
  };

  if (settings.withAssert) {
    context.window.PS.assert = function(condition, message) {
      if (!condition) {
        throw new Error("ASSERT: " + message);
      }
    };
  }

  context.window.window = context.window;
  context.appended = appended;
  context.debugMessages = debugMessages;
  context.runtimeErrors = runtimeErrors;

  vm.createContext(context);
  return context;
}

async function testSequentialLoading() {
  const manifest = ["a.js", "b.js", "c.js"];
  const context = createContext(manifest);

  vm.runInContext(loaderSource, context, { filename: "js/core/loader.js" });
  await context.window.PS.core.loaderPromise;

  assert.deepStrictEqual(
    context.appended.map(function(script) {
      return script.src;
    }),
    manifest,
    "loader should append manifest scripts in order"
  );
  context.appended.forEach(function(script) {
    assert.strictEqual(script.async, false, "dynamic scripts should opt into ordered classic execution");
  });
  assert.deepStrictEqual(Array.from(context.window.PS.core.loaderState.loaded), manifest, "loader state should record loaded scripts");
  assert.strictEqual(context.window.PS.core.loaderState.status, "complete", "loader should finish complete");
}

async function testFailureCrash() {
  const context = createContext(["a.js", "missing.js", "c.js"], {
    failAt: "missing.js",
    withAssert: true
  });

  vm.runInContext(loaderSource, context, { filename: "js/core/loader.js" });

  await assert.rejects(
    context.window.PS.core.loaderPromise,
    /ASSERT: Failed to load script: missing\.js/,
    "loader should reject with a hard crash when a script fails"
  );

  assert.deepStrictEqual(
    context.appended.map(function(script) {
      return script.src;
    }),
    ["a.js", "missing.js"],
    "loader should stop at the failed script"
  );
  assert.strictEqual(context.window.PS.core.loaderState.status, "failed", "loader should mark failure state");
  assert.strictEqual(context.window.PS.core.loaderState.failedScript, "missing.js", "loader should name failed script");
  assert.strictEqual(context.runtimeErrors[0].kind, "load.error", "loader should record a load error");
  assert.ok(context.debugMessages[0].includes("missing.js"), "loader should show a visible debug message");
}

(async function() {
  await testSequentialLoading();
  await testFailureCrash();
  console.log("script loader checks passed");
}()).catch(function(error) {
  console.error(error);
  process.exit(1);
});
