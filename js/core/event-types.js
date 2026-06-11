"use strict";
PS.eventTypes = PS.eventTypes || {};

PS.eventTypes.MILESTONE_REACHED = "milestone.reached";
PS.eventTypes.EPOCH_TRANSITION = "epoch.transition";

PS.eventTypes.ORGANISM_BORN = "organism.born";
PS.eventTypes.ORGANISM_DIED = "organism.died";
PS.eventTypes.SPECIES_NEW = "species.new";
PS.eventTypes.EXTINCTION_EVENT = "extinction.event";
PS.eventTypes.EXTINCTION_RECOVERY = "extinction.recovery";
PS.eventTypes.FOOD_SPAWNED = "food.spawned";
PS.eventTypes.SETTLEMENT_FOUNDED = "settlement.founded";

PS.eventTypes.TERRAIN_INVALIDATED = "terrain.invalidated";
PS.eventTypes.ATLAS_REBUILT = "atlas.rebuilt";
PS.eventTypes.RENDER_CONTEXT_LOST = "render.contextlost";
PS.eventTypes.RENDER_BACKEND_READY = "render.backend";

PS.eventTypes.TILE_INSPECTED = "tile.inspected";
PS.eventTypes.MENU_TOGGLED = "menu.toggled";
PS.eventTypes.BIOME_CHANGED = "biome.changed";

PS.eventTypes.CONFIG_CHANGED = "config.changed";
PS.eventTypes.SAVE_COMPLETED = "save.completed";
PS.eventTypes.LOAD_COMPLETED = "load.completed";

PS.eventPayloads = PS.eventPayloads || {};

PS.eventPayloads[PS.eventTypes.MILESTONE_REACHED] = {
  jsdoc: "@payload { type, label, detail, details, tick, deepTime, location, source, category, severity, inspectTarget, watcher }"
};
PS.eventPayloads[PS.eventTypes.EPOCH_TRANSITION] = {
  jsdoc: "@payload { from, to, siteId, tick }"
};
PS.eventPayloads[PS.eventTypes.ORGANISM_BORN] = {
  jsdoc: "@payload { id, representativeId, populationId, speciesId, lineageId, x, y, tick }"
};
PS.eventPayloads[PS.eventTypes.ORGANISM_DIED] = {
  jsdoc: "@payload { id, representativeId, populationId, speciesId, lineageId, cause, x, y, tick }"
};
PS.eventPayloads[PS.eventTypes.SPECIES_NEW] = {
  jsdoc: "@payload { id, parentId, lineageId, speciesId, populationId, traits, location, cause, divergence, tick }"
};
PS.eventPayloads[PS.eventTypes.EXTINCTION_EVENT] = {
  jsdoc: "@payload { id, eventType, severityScore, killRate, cause, location, affectedSpecies, survivors, losses, recoveryWindow, tick }"
};
PS.eventPayloads[PS.eventTypes.EXTINCTION_RECOVERY] = {
  jsdoc: "@payload { id, cause, recoveryWindow, survivorPopulationIds, radiationCandidateIds, tick }"
};
PS.eventPayloads[PS.eventTypes.FOOD_SPAWNED] = {
  jsdoc: "@payload { id, x, y, amount, source, tick }"
};
PS.eventPayloads[PS.eventTypes.SETTLEMENT_FOUNDED] = {
  jsdoc: "@payload { id, speciesId, populationId, x, y, level, tick }"
};
PS.eventPayloads[PS.eventTypes.TERRAIN_INVALIDATED] = {
  jsdoc: "@payload { chunkX, chunkY, tileX, tileY, reason, version }"
};
PS.eventPayloads[PS.eventTypes.ATLAS_REBUILT] = {
  jsdoc: "@payload { atlasId, textureWidth, textureHeight, entryCount, version }"
};
PS.eventPayloads[PS.eventTypes.RENDER_CONTEXT_LOST] = {
  jsdoc: "@payload { reason }"
};
PS.eventPayloads[PS.eventTypes.RENDER_BACKEND_READY] = {
  jsdoc: "@payload { backend }"
};
PS.eventPayloads[PS.eventTypes.TILE_INSPECTED] = {
  jsdoc: "@payload { tileX, tileY, surfacePosition, entityType, representativeId, tick }"
};
PS.eventPayloads[PS.eventTypes.MENU_TOGGLED] = {
  jsdoc: "@payload { isOpen, page, source }"
};
PS.eventPayloads[PS.eventTypes.BIOME_CHANGED] = {
  jsdoc: "@payload { biomeId, previousBiomeId, tileX, tileY, source }"
};
PS.eventPayloads[PS.eventTypes.CONFIG_CHANGED] = {
  jsdoc: "@payload { key, previousValue, nextValue, source }"
};
PS.eventPayloads[PS.eventTypes.SAVE_COMPLETED] = {
  jsdoc: "@payload { slot, bytes, tick, time }"
};
PS.eventPayloads[PS.eventTypes.LOAD_COMPLETED] = {
  jsdoc: "@payload { slot, version, tick, time }"
};

PS.eventTypeList = PS.eventTypeList || Object.keys(PS.eventTypes).map(function(key) {
  return PS.eventTypes[key];
});
