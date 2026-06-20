import { PS } from "../core/namespace.js";
import { openPixeldariumDatabase } from "./persistence-db.js";
import { applyWorldSaveData, exportWorldToJsonFile, importWorldFromJsonFile, loadWorldFromIndexedDB } from "./persistence-io.js";
import { saveWorldToIndexedDB, validateWorldSaveData } from "./persistence-restore-core.js";
import { createWorldSaveData } from "./persistence-save-data.js";
import { saveMigration } from "./save-migration.js";
import { importJsonFile } from "../ui/dom-refs.js";

PS.systems = PS.systems || {};

PS.persistence = {
  openDatabase: function() {
    return openPixeldariumDatabase();
  },
  createSaveData: function() {
    return createWorldSaveData();
  },
  validateSaveData: function(saveData) {
    return validateWorldSaveData(saveData);
  },
  migrateSaveData: function(saveData) {
    return saveMigration.migrate(saveData);
  },
  getMigrationStats: function() {
    return saveMigration.getStats();
  },
  applySaveData: function(saveData) {
    return applyWorldSaveData(saveData);
  },
  save: function() {
    return saveWorldToIndexedDB();
  },
  load: function() {
    return loadWorldFromIndexedDB();
  },
  exportJson: function() {
    return exportWorldToJsonFile();
  },
  importJsonFile: function(file) {
    return importWorldFromJsonFile(file);
  }
};

PS.systems.persistence = PS.persistence;
