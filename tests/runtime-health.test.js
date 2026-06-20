require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const namespaceSource = fs.readFileSync(path.join(root, "js/core/namespace.js"), "utf8");

function setPath(rootObject, pathName, value) {
  const parts = pathName.split(".");
  let cursor = rootObject;

  for (let i = 0; i < parts.length - 1; i++) {
    cursor[parts[i]] = cursor[parts[i]] || {};
    cursor = cursor[parts[i]];
  }

  cursor[parts[parts.length - 1]] = value;
}

const debugMessages = [];
const context = {
  console,
  Date,
  window: {
    addEventListener() {}
  },
  showDebugMessage(message) {
    debugMessages.push(message);
  }
};

context.window.window = context.window;
context.window.showDebugMessage = context.showDebugMessage;
vm.createContext(context);
vm.runInContext(namespaceSource, context, { filename: "js/core/namespace.js" });

for (const pathName of context.window.PS.runtime.requiredFunctions) {
  if (pathName.indexOf("PS.") === 0) {
    setPath(context.window.PS, pathName.slice(3), function () {});
  } else {
    setPath(context.window, pathName, function () {});
  }
}

let result = context.window.PS.runtime.verify();
assert.strictEqual(result.ok, true, "healthy runtime should pass verification");
assert.deepStrictEqual(Array.from(result.missing), [], "healthy runtime should not report missing functions");
assert.deepStrictEqual(debugMessages, [], "healthy runtime should not show debug warnings");

delete context.window.PS.time.runFrame;
result = context.window.PS.runtime.verify();
assert.strictEqual(result.ok, false, "missing namespace should fail verification");
assert.ok(result.missing.includes("PS.time.runFrame"), "verification should report the missing function path");
assert.strictEqual(
  context.window.PS.runtime.errors[0].kind,
  "runtime.verify.missing",
  "missing runtime functions should be recorded as a runtime warning"
);
assert.ok(
  debugMessages[0].indexOf("PS.time.runFrame") >= 0,
  "missing runtime function warning should be visible in debug output"
);

console.log("runtime health checks passed");
