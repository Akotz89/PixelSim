"use strict";
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
    return PS.systems.saveMigration.migrate(saveData);
  },
  getMigrationStats: function() {
    return PS.systems.saveMigration.getStats();
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
