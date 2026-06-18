#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const crateDir = path.join(root, "src", "sim");
const wasmDir = path.join(root, "wasm");
const wasmFile = path.join(wasmDir, "pixeldarium-sim_bg.wasm");
const sidecarFile = path.join(wasmDir, "pixeldarium-sim.wasm.js");
const metadataFile = path.join(wasmDir, "pixeldarium-sim.build.json");
const wasmGitignore = path.join(wasmDir, ".gitignore");

function run(command, args, options) {
  const result = spawnSync(command, args, Object.assign({
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32"
  }, options || {}));

  if (result.status !== 0) {
    throw new Error(command + " " + args.join(" ") + "\nSTDOUT:\n" + result.stdout + "\nSTDERR:\n" + result.stderr);
  }

  return result;
}

function hasCommand(command, args) {
  const result = spawnSync(command, args || ["--version"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  return result.status === 0;
}

function writeBase64Sidecar() {
  const bytes = fs.readFileSync(wasmFile);
  const base64 = bytes.toString("base64");
  const source = [
    "\"use strict\";",
    "window.PIXELDARIUM_SIM_WASM_B64 = " + JSON.stringify(base64) + ";",
    ""
  ].join("\n");

  fs.writeFileSync(sidecarFile, source);
}

function writeWasmGitignore() {
  fs.writeFileSync(wasmGitignore, [
    "*",
    "!.gitignore",
    "!pixeldarium-sim.js",
    "!pixeldarium-sim_bg.wasm",
    "!pixeldarium-sim.wasm.js",
    "!pixeldarium-sim.build.json",
    ""
  ].join("\n"));
}

function main() {
  fs.mkdirSync(wasmDir, { recursive: true });
  run("wasm-pack", [
    "build",
    crateDir,
    "--target",
    "no-modules",
    "--release",
    "--out-dir",
    path.relative(crateDir, wasmDir),
    "--out-name",
    "pixeldarium-sim",
    "--no-typescript",
    "--no-pack",
    "--no-opt"
  ]);

  const wasmOptAvailable = hasCommand("wasm-opt", ["--version"]);
  if (wasmOptAvailable) {
    run("wasm-opt", [
      "-Oz",
      "--enable-simd",
      "-o",
      wasmFile,
      wasmFile
    ]);
  }

  writeBase64Sidecar();
  writeWasmGitignore();

  const size = fs.statSync(wasmFile).size;
  const metadata = {
    module: "pixeldarium-sim",
    wasmPackTarget: "no-modules",
    fileProtocol: "script-tag + base64 sidecar, no fetch required",
    wasmOptAvailable: wasmOptAvailable,
    sizeBytes: size,
    sizeLimitBytes: 500 * 1024,
    sizePass: size < 500 * 1024,
    outputs: [
      "wasm/pixeldarium-sim.js",
      "wasm/pixeldarium-sim_bg.wasm",
      "wasm/pixeldarium-sim.wasm.js"
    ]
  };

  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2) + "\n");
  if (!metadata.sizePass) {
    throw new Error("WASM binary exceeds 500KB: " + size);
  }

  process.stdout.write(JSON.stringify(metadata, null, 2) + "\n");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  }
}
