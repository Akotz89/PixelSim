const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const shaderDir = path.join(root, "shaders");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function roundUp(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function layoutOf(type) {
  const scalarMatch = /^(f32|u32|i32)$/.exec(type);
  if (scalarMatch) {
    return { align: 4, size: 4 };
  }

  const vecMatch = /^vec([234])<(f32|u32|i32)>$/.exec(type);
  if (vecMatch) {
    const width = Number(vecMatch[1]);
    if (width === 2) {
      return { align: 8, size: 8 };
    }
    if (width === 3) {
      return { align: 16, size: 12 };
    }
    return { align: 16, size: 16 };
  }

  throw new Error("Unsupported WGSL uniform type in layout audit: " + type);
}

function parseStructs(source) {
  const structs = {};
  const structPattern = /struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)\n\};/g;
  let match;

  while ((match = structPattern.exec(source))) {
    const members = [];
    match[2].split("\n").forEach(function (line) {
      const memberMatch = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^,]+),\s*$/.exec(line);
      if (memberMatch) {
        members.push({
          name: memberMatch[1],
          type: memberMatch[2].trim()
        });
      }
    });
    structs[match[1]] = members;
  }

  return structs;
}

function parseUniformBindings(source) {
  const bindings = [];
  const bindingPattern = /@group\(\d+\)\s+@binding\(\d+\)\s+var<uniform>\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/g;
  let match;

  while ((match = bindingPattern.exec(source))) {
    bindings.push({
      variableName: match[1],
      structName: match[2]
    });
  }

  return bindings;
}

function computeStructLayout(members) {
  let offset = 0;
  let maxAlign = 1;

  members.forEach(function (member) {
    const layout = layoutOf(member.type);
    offset = roundUp(offset, layout.align);
    member.offset = offset;
    member.align = layout.align;
    member.size = layout.size;
    offset += layout.size;
    maxAlign = Math.max(maxAlign, layout.align);
  });

  return {
    align: maxAlign,
    size: roundUp(offset, maxAlign),
    uniformBytes: roundUp(roundUp(offset, maxAlign), 16)
  };
}

const expectedUniformBytes = {
  "biome-render.wgsl::BiomeParams": 32,
  "density.wgsl::DensityParams": 32,
  "entity-atlas.wgsl::EntityUniforms": 16,
  "gbuffer-compose.wgsl::ComposeUniforms": 80,
  "gbuffer-terrain.wgsl::TileUniforms": 16,
  "geochemistry.wgsl::GeochemistryParams": 64,
  "globe-sphere.wgsl::GlobeUniforms": 96,
  "heat-diffusion.wgsl::HeatParams": 48,
  "lbm-ocean.wgsl::OceanParams": 32,
  "lenia.wgsl::LeniaParams": 64,
  "moisture.wgsl::MoistureParams": 64,
  "molecular-dynamics.wgsl::MdParams": 32,
  "particle.wgsl::ParticleUniforms": 16,
  "pixel-ca.wgsl::PixelCaParams": 32,
  "point-light.wgsl::PointLightUniforms": 16,
  "reaction-diffusion.wgsl::ReactionDiffusionParams": 48,
  "salinity.wgsl::SalinityParams": 48,
  "shadow.wgsl::ShadowUniforms": 16,
  "sprite-displace.wgsl::DisplacementUniforms": 32,
  "sprite-batch.wgsl::SpriteUniforms": 16,
  "surface-chunk.wgsl::ChunkUniforms": 16,
  "surface-underlay.wgsl::UnderlayUniforms": 32,
  "terrain-tile.wgsl::TileUniforms": 16,
  "terrain-tilemap.wgsl::TilemapUniforms": 64,
  "terrain.wgsl::TerrainUniforms": 48,
  "tile-light.wgsl::TileLightUniforms": 32,
  "water-displace.wgsl::WaterUniforms": 32
};

const sourceByteGuards = [
  ["js/render/webgpu-globe.js", "globe-sphere.uniforms", "size: 96"],
  ["js/render/webgpu-globe.js", "new Float32Array(24)", "new Float32Array(24)"],
  ["js/render/webgpu-compositor.js", "gbuffer-compose.uniforms", "size: 80"],
  ["js/render/webgpu-compositor.js", "new Float32Array(20)", "new Float32Array(20)"],
  ["js/render/webgpu-tile-lights.js", "tile-light.uniforms", "size: 32"],
  ["js/render/webgpu-point-lights.js", "point-light.uniforms", "size: 16"],
  ["js/render/webgpu-water-displacement.js", "water-displace.uniforms", "size: 32"],
  ["js/render/webgpu-entity.js", "displacement.uniforms", "size: kind === \"displacement\" ? 32 : 16"],
  ["js/render/webgpu-surface-tile.js", "terrain-tile.uniforms", "size: 16"],
  ["js/render/webgpu-surface-tile.js", "terrain-tilemap.uniforms", "size: 64"],
  ["js/render/webgpu-entity.js", "entity-atlas.uniforms", "size: 16"],
  ["js/render/webgpu-surface-underlay.js", "surface-underlay.uniforms", "size: 32"],
  ["js/sim/heat-diffusion.js", "heat.params", "createBuffer(\"heat.params\", 48"],
  ["js/sim/lbm-ocean.js", "ocean.params", "createBuffer(\"ocean.params\", 32"],
  ["js/sim/thermohaline.js", "thermohaline.salinity.params", "createBuffer(\"thermohaline.salinity.params\", 48"],
  ["js/sim/thermohaline.js", "thermohaline.density.params", "createBuffer(\"thermohaline.density.params\", 32"],
  ["js/sim/reaction-diffusion.js", "reaction-diffusion.params", "createBuffer(\"reaction-diffusion.params\", 48"],
  ["js/sim/moisture.js", "moisture.params", "createBuffer(\"moisture.params\", 64"],
  ["js/sim/pixel-ca.js", "pixel-ca.params", "createBuffer(\"pixel-ca.params\", 32"],
  ["js/sim/molecular-dynamics.js", "molecular-dynamics.params", "createBuffer(\"molecular-dynamics.params\", 32"],
  ["js/sim/lenia.js", "lenia.params", "createBuffer(\"lenia.params\", 64"],
  ["js/sim/geochemistry.js", "geochemistry.params", "createBuffer(\"geochemistry.params\", 64"]
];

const uniformLayouts = {};

fs.readdirSync(shaderDir)
  .filter(function (file) { return file.endsWith(".wgsl"); })
  .sort()
  .forEach(function (file) {
    const relativePath = "shaders/" + file;
    const source = read(relativePath);
    const sidecarPath = relativePath + ".js";
    const structs = parseStructs(source);
    const bindings = parseUniformBindings(source);

    if (fs.existsSync(path.join(root, sidecarPath))) {
      assert.ok(read(sidecarPath).indexOf("PS.assets.registerText(\"" + relativePath + "\"") >= 0, file + " sidecar should register the WGSL asset path");
    }

    bindings.forEach(function (binding) {
      const key = file + "::" + binding.structName;
      const members = structs[binding.structName];
      assert.ok(members, key + " should declare the uniform struct it binds");
      const layout = computeStructLayout(members);

      assert.strictEqual(
        layout.uniformBytes % 16,
        0,
        key + " should have a 16-byte uniform binding footprint"
      );
      assert.strictEqual(
        expectedUniformBytes[key],
        layout.uniformBytes,
        key + " expected byte mapping should match computed WGSL layout"
      );

      uniformLayouts[key] = {
        variableName: binding.variableName,
        bytes: layout.uniformBytes,
        members: members.map(function (member) {
          return member.name + "@" + member.offset + ":" + member.type;
        })
      };
    });
  });

assert.ok(
  Object.keys(uniformLayouts).length >= 17,
  "WGSL uniform audit should cover at least the 17 original GLSL uniform mappings"
);
assert.deepStrictEqual(
  Object.keys(uniformLayouts).sort(),
  Object.keys(expectedUniformBytes).sort(),
  "every current WGSL uniform struct should be explicitly byte-mapped"
);

sourceByteGuards.forEach(function (guard) {
  const source = read(guard[0]);
  assert.ok(source.indexOf(guard[2]) >= 0, guard[1] + " should retain JS byte guard " + guard[2]);
});

console.log("WGSL uniform layout checks passed", JSON.stringify({
  uniformStructs: Object.keys(uniformLayouts).length,
  bytes: Object.keys(uniformLayouts).reduce(function (acc, key) {
    acc[key] = uniformLayouts[key].bytes;
    return acc;
  }, {})
}));
