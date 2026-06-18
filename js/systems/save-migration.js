import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clonePersistencePlainValue, PIXELDARIUM_SAVE_ID, PIXELDARIUM_SAVE_VERSION } from "./persistence-db.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "./state.js";

PS.systems = PS.systems || {};

export function getTerrainTileIdForSave(terrainValue) {
  if (typeof terrainValue === "string") {
    return terrainValue;
  }

  if (Number(terrainValue) === Number(CONFIG.TERRAIN_FERTILE)) {
    return "grass_lush";
  }

  return "rock";
}

export function getTerrainTileIdsForSave(terrain) {
  var source = Array.isArray(terrain) ? terrain : [];
  var tileIds = new Array(source.length);

  for (var i = 0; i < source.length; i++) {
    tileIds[i] = getTerrainTileIdForSave(source[i]);
  }

  return tileIds;
}

export function normalizeMigratedOrganism(organism) {
  var target = organism || {};

  if (!target.entityType) {
    target.entityType = "herbivore_basic";
  }

  if (!target.animationState) {
    target.animationState = "idle";
  }

  return target;
}

export function cloneSaveDataForMigration(saveData) {
  return clonePersistencePlainValue(saveData);
}

PS.systems.saveMigration = {
  migrations: {},
  stats: {
    lastFromVersion: 0,
    lastToVersion: 0,
    lastPath: [],
    lastLog: "",
    migratedCount: 0
  },

  register: function (fromVersion, toVersion, migrateFn) {
    var from = Math.max(1, Math.round(Number(fromVersion) || 0));
    var to = Math.max(1, Math.round(Number(toVersion) || 0));

    if (to <= from) {
      throw new Error("Save migration target must be newer than source");
    }

    if (typeof migrateFn !== "function") {
      throw new Error("Save migration requires a migration function");
    }

    this.migrations[String(from)] = {
      from: from,
      to: to,
      migrate: migrateFn
    };

    return this;
  },

  migrate: function (saveData) {
    var data = cloneSaveDataForMigration(saveData || {});
    var current = Math.max(1, Math.round(Number(data.version) || 1));
    var target = Math.max(1, Math.round(Number(PIXELDARIUM_SAVE_VERSION) || 1));
    var path = [current];
    var fromVersion = current;

    if (current > target) {
      throw new Error("Save version " + current + " is newer than runtime version " + target);
    }

    while (current < target) {
      var migration = this.migrations[String(current)];

      if (!migration) {
        throw new Error("No save migration from v" + current);
      }

      data = migration.migrate(data);
      current = Math.max(1, Math.round(Number(data.version) || migration.to));
      path.push(current);

      if (current !== migration.to) {
        throw new Error("Save migration v" + migration.from + " produced v" + current + " instead of v" + migration.to);
      }
    }

    this.stats.lastFromVersion = fromVersion;
    this.stats.lastToVersion = current;
    this.stats.lastPath = path.slice();
    this.stats.lastLog = path.length > 1 ? "Migrated save from v" + path.join(" -> v") : "Save already at v" + current;
    this.stats.migratedCount = Math.max(0, path.length - 1);
    data.version = current;
    data.migrationLog = this.stats.lastLog;
    return data;
  },

  validate: function (saveData) {
    if (!saveData || saveData.id !== PIXELDARIUM_SAVE_ID) {
      throw new Error("No Pixeldarium save found");
    }

    if (saveData.version !== PIXELDARIUM_SAVE_VERSION) {
      throw new Error("Unsupported save version");
    }

    if (!Array.isArray(saveData.terrain) || saveData.terrain.length !== WORLD_WIDTH * WORLD_HEIGHT) {
      throw new Error("Save terrain does not match this world size");
    }

    if (
      saveData.terrainTileIds &&
      (!Array.isArray(saveData.terrainTileIds) || saveData.terrainTileIds.length !== saveData.terrain.length)
    ) {
      throw new Error("Save terrain tile ids do not match terrain length");
    }

    if (!Array.isArray(saveData.food) || !Array.isArray(saveData.organisms)) {
      throw new Error("Save is missing food or organism data");
    }

    return true;
  },

  getStats: function () {
    return {
      lastFromVersion: this.stats.lastFromVersion,
      lastToVersion: this.stats.lastToVersion,
      lastPath: this.stats.lastPath.slice(),
      lastLog: this.stats.lastLog,
      migratedCount: this.stats.migratedCount
    };
  }
};

PS.systems.saveMigration.register(1, 2, function (data) {
  var organisms = Array.isArray(data.organisms) ? data.organisms : [];

  for (var i = 0; i < organisms.length; i++) {
    normalizeMigratedOrganism(organisms[i]);
  }

  data.organisms = organisms;
  data.version = 2;
  return data;
});

PS.systems.saveMigration.register(2, 3, function (data) {
  data.terrainTileIds = getTerrainTileIdsForSave(data.terrain);

  // Ensure epoch state defaults for pre-epoch saves (AZR-1105)
  if (data.era === undefined) {
    data.era = "Organisms";
  }
  if (data.epochScaling === undefined) {
    data.epochScaling = null;
  }

  data.version = 3;
  return data;
});
