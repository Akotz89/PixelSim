import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

export function getDashboardDeepTimeLabel() {
  var years = Math.max(0, Number(world.deepTimeYears) || 0);

  if (PS.deepTime && typeof PS.deepTime.formatYears === "function") {
    return PS.deepTime.formatYears(years);
  }

  return Math.round(years).toLocaleString() + " years";
}

export function getDashboardTimeScaleLabel() {
  if (PS.time && typeof PS.time.getTimeScaleLabel === "function") {
    return PS.time.getTimeScaleLabel();
  }

  return "speed " + Math.max(0, Number(world.speed) || 0).toFixed(1) + "x";
}

export function getDashboardOverlayLabel() {
  var overlayId = world.activeObservationOverlay || "none";
  var overlays = PS.render && PS.render.overlays;
  var overlay = overlays && typeof overlays.get === "function" ? overlays.get(overlayId) : null;

  if (overlay && overlay.semantic) {
    return overlay.semantic;
  }

  return overlayId === "none" ? "None" : overlayId;
}

export function getDashboardSpeciesCounts(speciesSummary) {
  speciesSummary = speciesSummary || {};

  return {
    active: Math.max(0, Math.round(Number(speciesSummary.activeCount) || 0)),
    total: Math.max(0, Math.round(Number(speciesSummary.totalCount) || 0)),
    extinct: Math.max(0, Math.round(Number(speciesSummary.extinctCount) || 0)),
    recent: Math.max(0, Math.round(Number(speciesSummary.recentSpeciationCount) || 0))
  };
}

export function getDashboardBiodiversity(populations, speciesSummary) {
  var counts = [];
  var total = 0;

  for (var i = 0; i < populations.length; i++) {
    var population = Math.max(0, Math.round(Number(populations[i].count) || 0));

    if (population > 0) {
      counts.push(population);
      total += population;
    }
  }

  if (counts.length === 0 && speciesSummary && Array.isArray(speciesSummary.topSpecies)) {
    for (var j = 0; j < speciesSummary.topSpecies.length; j++) {
      var topCount = Math.max(0, Math.round(Number(speciesSummary.topSpecies[j].activeCount) || 0));

      if (topCount > 0) {
        counts.push(topCount);
        total += topCount;
      }
    }
  }

  if (counts.length === 0 || total <= 0) {
    return {
      index: 0,
      evenness: 0,
      activeGroups: 0,
      topShare: 0
    };
  }

  var entropy = 0;
  var top = 0;

  for (var k = 0; k < counts.length; k++) {
    var share = counts[k] / total;
    entropy -= share * Math.log(share);
    top = Math.max(top, counts[k]);
  }

  var evenness = counts.length > 1 ? entropy / Math.log(counts.length) : 0.1;

  return {
    index: Math.round(clamp(evenness, 0, 1) * 100),
    evenness: evenness,
    activeGroups: counts.length,
    topShare: top / total
  };
}

export function getDashboardBiomeMix(populations) {
  var counts = {};
  var topBiome = "-";
  var topCount = 0;
  var fertileValue = CONFIG && Object.prototype.hasOwnProperty.call(CONFIG, "TERRAIN_FERTILE")
    ? CONFIG.TERRAIN_FERTILE
    : 1;

  function addBiome(tileX, tileY) {
    var index = tileY * WORLD_WIDTH + tileX;
    var tile = world.planetTiles && world.planetTiles[index];
    var biome = tile && tile.biome ? tile.biome : (world.terrain && world.terrain[index] === fertileValue ? "fertile" : "barren");
    counts[biome] = (counts[biome] || 0) + 1;
  }

  for (var i = 0; i < populations.length; i++) {
    var cells = Array.isArray(populations[i].territoryCells) ? populations[i].territoryCells : [];

    for (var j = 0; j < cells.length; j++) {
      var cell = cells[j];
      var x = Math.max(0, Math.min(WORLD_WIDTH - 1, Math.round(Number(cell.x) || 0)));
      var y = Math.max(0, Math.min(WORLD_HEIGHT - 1, Math.round(Number(cell.y) || 0)));
      addBiome(x, y);
    }
  }

  Object.keys(counts).forEach(function(biome) {
    if (counts[biome] > topCount) {
      topBiome = biome;
      topCount = counts[biome];
    }
  });

  return {
    topBiome: topBiome,
    topCount: topCount,
    biomeCount: Object.keys(counts).length
  };
}

export function getDashboardTraitDistribution(traitSummary) {
  var keys = ["bodySize", "carnivory", "intelligence", "sociality", "thermalTolerance", "waterDependency"];
  var values = [];

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = Number(traitSummary && traitSummary[key]);

    if (Number.isFinite(value)) {
      values.push({
        key: key,
        value: value,
        label: key.replace(/([A-Z])/g, " $1").toLowerCase()
      });
    }
  }

  return values;
}

export function getDashboardEnvironmentSummary() {
  var atmosphere = world.atmosphere || {};
  var geology = world.geology || {};

  return {
    oxygen: Number.isFinite(Number(atmosphere.oxygenPercent)) ? Number(atmosphere.oxygenPercent) : null,
    carbonDioxide: Number.isFinite(Number(atmosphere.carbonDioxidePpm)) ? Number(atmosphere.carbonDioxidePpm) : null,
    temperature: Number.isFinite(Number(atmosphere.temperatureC)) ? Number(atmosphere.temperatureC) : null,
    ozone: Number.isFinite(Number(atmosphere.ozoneIndex)) ? Number(atmosphere.ozoneIndex) : null,
    volcanic: Number.isFinite(Number(geology.volcanicActivity)) ? Number(geology.volcanicActivity) : null,
    hydrothermalVents: Math.max(0, Math.round(Number(geology.hydrothermalVentCount) || 0)),
    anomaly: atmosphere.anomaly || geology.anomaly || "-"
  };
}

export function getDashboardMicrobialStatus() {
  var microbial = world.microbial || {};
  var abiogenesis = world.abiogenesis || {};
  var density = Math.max(0, Number(microbial.totalDensity) || 0);
  var complexity = Math.max(0, Number(abiogenesis.maxComplexity) || 0);

  if (world.microbialReady || density > 0) {
    return "microbial " + density.toFixed(2);
  }

  if (complexity > 0) {
    return "abiogenesis " + complexity.toFixed(2);
  }

  return "prebiotic";
}

export function getStatisticsDashboardSnapshot(summary) {
  var populations = Array.isArray(world.biologyPopulations) ? world.biologyPopulations : [];
  var speciesSummary = world.speciesSummary || {};
  var speciesCounts = getDashboardSpeciesCounts(speciesSummary);
  var biodiversity = getDashboardBiodiversity(populations, speciesSummary);
  var foodWeb = world.foodWebSummary || {};
  var terrainPressure = world.terrainPressureSummary || {};

  world.statisticsDashboard = {
    tick: Math.max(0, Math.round(Number(world.tick) || 0)),
    epoch: world.era || "-",
    deepTime: getDashboardDeepTimeLabel(),
    timeScale: getDashboardTimeScaleLabel(),
    totalOrganisms: summary ? Math.max(0, Math.round(Number(summary.population) || 0)) : Math.max(0, world.organisms.length),
    estimatedIndividuals: populations.reduce(function(total, population) {
      return total + Math.max(0, Math.round(Number(population.count) || 0));
    }, 0),
    species: speciesCounts,
    extinctionCount: speciesCounts.extinct,
    biodiversity: biodiversity,
    biomeMix: getDashboardBiomeMix(populations),
    food: summary ? Math.max(0, Math.round(Number(summary.food) || 0)) : Math.max(0, world.food.length),
    foodRunwayTicks: summary ? summary.foodRunwayTicks : -1,
    resourceBalance: summary ? summary.resourceBalance : "-",
    energyPressure: Number.isFinite(Number(foodWeb.predatorPressure)) ? Number(foodWeb.predatorPressure) : 0,
    trophicBalance: Math.max(0, Math.round(Number(foodWeb.trophicBalance) || 0)),
    traitDistribution: getDashboardTraitDistribution(world.populationTraitSummary),
    environment: getDashboardEnvironmentSummary(),
    microbialStatus: getDashboardMicrobialStatus(),
    overlay: getDashboardOverlayLabel(),
    updatedEveryTicks: Math.max(1, Math.round(Number(CONFIG.SIM_SUMMARY_UPDATE_INTERVAL) || 1))
  };

  return world.statisticsDashboard;
}

