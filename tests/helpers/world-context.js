require("../test-esm-helper.js");

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "../..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function runSource(context, file) {
  return vm.runInContext(read(file), context, { filename: file });
}

function runSources(context, files) {
  files.forEach(function (file) {
    runSource(context, file);
  });
  return context;
}

module.exports = {
  assert,
  fs,
  path,
  vm,
  root,
  read
};
