"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const namespacePath = "js/core/namespace.js";
const skipDirectoryFragments = ["/workers/"];
const builtInWindowAliases = new Set(["toLocaleString"]);

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function readProjectFile(projectPath) {
  return fs.readFileSync(path.join(root, projectPath), "utf8");
}

function writeProjectFile(projectPath, source) {
  fs.writeFileSync(path.join(root, projectPath), source);
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const projectPath = toPosix(path.join(dir, entry.name));

    if (entry.isDirectory()) {
      walk(projectPath, files);
      continue;
    }

    if (entry.isFile() && projectPath.endsWith(".js")) {
      files.push(projectPath);
    }
  }
}

function shouldSkip(projectPath) {
  return skipDirectoryFragments.some((fragment) => projectPath.includes(fragment));
}

function getAllJsFiles() {
  const files = [];
  walk("js", files);
  files.unshift("config.js");
  return files.filter((file) => !shouldSkip(file));
}

function collectExportNames(projectPath, source) {
  const names = [];
  const exportPatterns = [
    /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+class\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
  ];

  for (const pattern of exportPatterns) {
    for (const match of source.matchAll(pattern)) {
      names.push(match[1]);
    }
  }

  for (const match of source.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of match[1].split(",")) {
      const trimmed = part.trim();

      if (!trimmed) {
        continue;
      }

      const aliasParts = trimmed.split(/\s+as\s+/);
      names.push((aliasParts[1] || aliasParts[0]).trim());
    }
  }

  if (projectPath === namespacePath) {
    names.push("PS");
  }

  return names;
}

function collectExportMap(files) {
  const exportMap = new Map();

  for (const projectPath of files) {
    if (!fs.existsSync(path.join(root, projectPath))) {
      continue;
    }

    const source = readProjectFile(projectPath);

    for (const name of collectExportNames(projectPath, source)) {
      if (name === "PS") {
        exportMap.set(name, namespacePath);
        continue;
      }

      if (!exportMap.has(name)) {
        exportMap.set(name, projectPath);
      }
    }
  }

  exportMap.set("PS", namespacePath);
  return exportMap;
}

function getRelativeImportPath(fromProjectPath, toProjectPath) {
  let relativePath = path.posix.relative(path.posix.dirname(fromProjectPath), toProjectPath);

  if (!relativePath.startsWith(".")) {
    relativePath = "./" + relativePath;
  }

  return relativePath;
}

function collectWindowPreambleNames(source) {
  const names = [];

  for (const match of source.matchAll(/^var\s+([A-Za-z_$][\w$]*)\s*=\s*window\.\1;$/gm)) {
    names.push(match[1]);
  }

  return names;
}

function hasPsReference(source) {
  return /\bPS\b/.test(source);
}

function removeMigrationPreamble(source) {
  source = source.replace(
    /\/\/ --- ESM Migration: globals from other modules ---\n(?:var [A-Za-z_$][\w$]* = window\.[A-Za-z_$][\w$]*;\n)+\n?/g,
    ""
  );

  source = source.replace(/^var [A-Za-z_$][\w$]* = window\.[A-Za-z_$][\w$]*;\n/gm, "");

  return source;
}

function removeCompatibilityGlobals(source) {
  source = source.replace(
    /\/\/ --- ES Module Migration: backward-compat globals ---\n(?:window\.[A-Za-z_$][\w$]* = [A-Za-z_$][\w$]*;\n)+\n?/g,
    ""
  );

  source = source.replace(/^window\.([A-Za-z_$][\w$]*) = \1;\n/gm, "");

  return source;
}

function removeOldPsDeclaration(source) {
  source = source.replace(/^export var PS = window\.PS \|\| \{\};\n/gm, "");
  source = source.replace(/^var PS = window\.PS \|\| \{\};\n/gm, "");
  source = source.replace(/^window\.PS = PS;\n/gm, "");
  return source;
}

function makeImportBlock(projectPath, names, exportMap) {
  const grouped = new Map();

  for (const name of names) {
    if (builtInWindowAliases.has(name)) {
      continue;
    }

    const sourcePath = exportMap.get(name);

    if (!sourcePath || sourcePath === projectPath) {
      continue;
    }

    if (!grouped.has(sourcePath)) {
      grouped.set(sourcePath, new Set());
    }

    grouped.get(sourcePath).add(name);
  }

  return Array.from(grouped.entries())
    .sort(([firstPath], [secondPath]) => firstPath.localeCompare(secondPath))
    .map(([sourcePath, sourceNames]) => {
      const relativePath = getRelativeImportPath(projectPath, sourcePath);
      const sortedNames = Array.from(sourceNames).sort((first, second) => first.localeCompare(second));
      return `import { ${sortedNames.join(", ")} } from "${relativePath}";`;
    })
    .join("\n");
}

function insertImportBlock(source, importBlock) {
  if (!importBlock) {
    return source;
  }

  const strictMatch = source.match(/^"use strict";\n\n?/);

  if (strictMatch) {
    const offset = strictMatch[0].length;
    return source.slice(0, offset) + importBlock + "\n\n" + source.slice(offset);
  }

  return importBlock + "\n\n" + source.replace(/^\n+/, "");
}

function migrateNamespace(source) {
  source = source.replace(
    /^"use strict";\nvar PS = window\.PS \|\| \{\};/,
    `"use strict";\nconst globalScope = typeof globalThis !== "undefined" ? globalThis : window;\nexport var PS = globalScope.PS || {};`
  );
  source = source.replace(/^window\.PS = PS;\n/gm, "globalScope.PS = PS;\n");
  return source;
}

function migrateFile(projectPath, source, exportMap) {
  if (projectPath === namespacePath) {
    return migrateNamespace(source);
  }

  const oldPreambleNames = collectWindowPreambleNames(source);
  let importNames = oldPreambleNames.slice();

  if (hasPsReference(source)) {
    importNames.push("PS");
  }

  source = removeMigrationPreamble(source);
  source = removeCompatibilityGlobals(source);
  source = removeOldPsDeclaration(source);

  const importBlock = makeImportBlock(projectPath, Array.from(new Set(importNames)), exportMap);
  return insertImportBlock(source, importBlock);
}

function main() {
  const files = getAllJsFiles();
  const exportMap = collectExportMap(files);
  const changed = [];
  const missing = new Map();

  for (const projectPath of files) {
    const absolutePath = path.join(root, projectPath);

    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const source = readProjectFile(projectPath);
    const preambleNames = collectWindowPreambleNames(source)
      .filter((name) => !builtInWindowAliases.has(name));

    for (const name of preambleNames) {
      if (!exportMap.has(name)) {
        if (!missing.has(name)) {
          missing.set(name, []);
        }
        missing.get(name).push(projectPath);
      }
    }

    const migrated = migrateFile(projectPath, source, exportMap);

    if (migrated !== source) {
      writeProjectFile(projectPath, migrated);
      changed.push(projectPath);
    }
  }

  if (missing.size > 0) {
    console.error("Missing export sources:");
    for (const [name, paths] of missing.entries()) {
      console.error(`  ${name}: ${paths.join(", ")}`);
    }
    process.exitCode = 1;
  }

  console.log(`Migrated ${changed.length} files.`);
  for (const projectPath of changed) {
    console.log(`  ${projectPath}`);
  }
}

main();
