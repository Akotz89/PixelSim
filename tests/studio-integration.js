const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const studioRoot = process.env.PIXELDARIUM_AGENT_STUDIO_ROOT ||
  "/mnt/c/Users/Aaron/Azyrra/projects/pixeldarium-agent-studio";
const python = fs.existsSync(path.join(studioRoot, ".venv", "bin", "python"))
  ? path.join(studioRoot, ".venv", "bin", "python")
  : "python3";
const exportName = "azr554-smoke";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 255] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function encodeRgbaPng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const scanlineLength = width * 4;
  const raw = Buffer.alloc((scanlineLength + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (scanlineLength + 1);
    raw[rawOffset] = 0;
    rgba.copy(raw, rawOffset + 1, y * scanlineLength, (y + 1) * scanlineLength);
  }

  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function writeSmokeSprite(filePath) {
  const width = 32;
  const height = 32;
  const rgba = Buffer.alloc(width * height * 4);
  const colors = [
    [45, 90, 30, 255],
    [74, 140, 42, 255],
    [122, 182, 72, 255],
    [26, 26, 46, 255]
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const transparent = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      const color = transparent ? [0, 0, 0, 0] : colors[(x + y) % colors.length];
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = color[3];
    }
  }

  fs.writeFileSync(filePath, encodeRgbaPng(width, height, rgba));
}

function runCommand(command, args, options) {
  const result = spawnSync(command, args, Object.assign({
    cwd: studioRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16
  }, options || {}));

  assert.strictEqual(
    result.status,
    0,
    command + " " + args.join(" ") + " failed\nstdout:\n" + result.stdout + "\nstderr:\n" + result.stderr
  );
  return result;
}

function pngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function run() {
  assert.ok(fs.existsSync(studioRoot), "Agent Studio root should exist: " + studioRoot);
  assert.ok(fs.existsSync(path.join(studioRoot, "scripts", "pipeline_runner.py")), "studio pipeline_runner.py should exist");
  assert.ok(fs.existsSync(path.join(studioRoot, "scripts", "validate_export.py")), "studio validate_export.py should exist");
  assert.ok(fs.existsSync(path.join(studioRoot, "HANDOFF.md")), "studio HANDOFF.md should exist");
  assert.ok(fs.existsSync(path.join(studioRoot, "workbench.html")), "studio workbench.html should exist");

  const runtimeHandoff = fs.readFileSync(path.join(root, "docs", "agent-studio-handoff.md"), "utf8");
  assert.ok(runtimeHandoff.indexOf("exports/{category}/{name}/") >= 0, "runtime handoff should describe studio export shape");
  assert.ok(runtimeHandoff.indexOf("assets/manifest.json") >= 0, "runtime handoff should require manifest integration");

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pixeldarium-studio-smoke-"));
  const inputDir = path.join(tmpRoot, exportName);
  const outputDir = path.join(tmpRoot, "exports", "terrain", exportName);
  const reportPath = path.join(tmpRoot, "pipeline-report.json");
  ensureDir(inputDir);
  ensureDir(outputDir);
  writeSmokeSprite(path.join(inputDir, "frame0.png"));

  runCommand(python, [
    "scripts/pipeline_runner.py",
    "--input", inputDir,
    "--output", outputDir,
    "--palette", "source/pixeldarium-palette.json",
    "--size", "32x32",
    "--atlas-cols", "1",
    "--report", reportPath
  ]);

  const pngPath = path.join(outputDir, exportName + ".png");
  const jsonPath = path.join(outputDir, exportName + ".json");
  assert.ok(fs.existsSync(pngPath), "pipeline should write handoff PNG");
  assert.ok(fs.existsSync(jsonPath), "pipeline should write handoff JSON");

  const pipelineMetadata = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const frame = pipelineMetadata.frames && pipelineMetadata.frames[0] && pipelineMetadata.frames[0].frame;
  assert.ok(frame, "pipeline atlas metadata should describe the smoke frame");
  fs.writeFileSync(jsonPath, JSON.stringify({
    type: "grid",
    tileWidth: frame.w,
    tileHeight: frame.h,
    columns: 1,
    rows: 1,
    names: ["terrain." + exportName + ".0"]
  }, null, 2) + "\n");
  runCommand(python, ["scripts/validate_export.py", outputDir]);

  const metadata = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.strictEqual(report.ok, true, "pipeline report should pass");
  assert.strictEqual(metadata.type, "grid", "handoff metadata should use grid format");
  assert.strictEqual(metadata.tileWidth, frame.w, "handoff tile width should match pipeline atlas frame");
  assert.strictEqual(metadata.tileHeight, 32, "handoff tile height should match smoke sprite");
  assert.strictEqual(metadata.columns, 1, "handoff atlas should contain one column");
  assert.strictEqual(metadata.rows, 1, "handoff atlas should contain one row");
  assert.deepStrictEqual(
    pngSize(fs.readFileSync(pngPath)),
    { width: metadata.tileWidth * metadata.columns, height: metadata.tileHeight * metadata.rows },
    "handoff PNG dimensions should match metadata"
  );

  const runtimeLeak = spawnSync("rg", ["-n", "agent-studio|tools/agent-studio", "index.html", "js"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.strictEqual(runtimeLeak.status, 1, "runtime files should not reference Agent Studio tooling");

  console.log("studio integration smoke checks passed", JSON.stringify({
    studioRoot,
    output: outputDir,
    steps: Object.keys(report.steps || {}),
    cells: (metadata.names || []).length || metadata.columns * metadata.rows
  }));
}

run();
