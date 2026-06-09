# Pixeldarium Save Format — Version 3

**Current version**: `PIXELDARIUM_SAVE_VERSION = 3` (`js/systems/persistence-db.js`)
**Config reference**: `CONFIG.SAVE_FORMAT_VERSION = 1` (config.js)  
**Storage**: IndexedDB database `pixeldarium`, object store `saves`, key `latest`  
**Export**: JSON file download via Export JSON button

## Save Envelope

```json
{
  "id": "latest",
  "version": 3,
  "savedAt": "ISO-8601 timestamp",
  "worldWidth": 320,
  "worldHeight": 170,
  "tileSize": 5
}
```

## Config Delta

`config` is schema versioned separately from the save envelope and stores only
runtime constants that differ from `PS.config.captureDefaults()`:

```json
{
  "schemaVersion": 1,
  "constants": {
    "STARTING_FOOD": 500
  }
}
```

Older camelCase config snapshots still load through `applySaveConfig()`, but new
saves do not write the legacy full-config blob.

## Top-Level State Fields

| Field | Type | Description |
|-------|------|-------------|
| tick | int | Current simulation tick |
| deepTimeYears | number | Semantic deep-time elapsed according to adaptive time scale |
| timeScale | object | Current adaptive/manual time-scale state |
| milestonesReached | object | Fired milestone map used to prevent duplicate milestone events |
| speed | int | Sim speed multiplier (1-10) |
| era | string | Current era name |
| isExtinct | bool | Whether all organisms died |
| extinctionTick | int | Tick of extinction (0 if alive) |
| totalBirths/Deaths | int | Lifetime counters |
| totalFoodSpawned/Consumed/Harvested | int | Lifetime food counters |
| seedText | string | World seed string |
| rngState | uint32 | Current xorshift32 RNG state |
| nextLineageId | int | Auto-increment counter |
| nextSpeciesId | int | Auto-increment counter for biology species IDs |
| nextBiologyPopulationId | int | Auto-increment counter for aggregate biology population IDs |
| nextBiologyRepresentativeId | int | Auto-increment counter for watchable representative organism IDs |
| microbialReady | bool | Whether microbial field growth has crossed the readiness threshold |
| nextSettlementId | int | Auto-increment counter |
| nextSettlementRouteId | int | Auto-increment counter |
| nextOrbitalAssetId | int | Auto-increment counter |
| nextPlanetaryBodyId | int | Auto-increment counter |
| nextProbeMissionId | int | Auto-increment counter |
| nextStarSystemId | int | Auto-increment counter |
| nextInterstellarFleetId | int | Auto-increment counter |
| nextEmpireSectorId | int | Auto-increment counter |

## Progression State Fields

Colony network, space program, orbital, planetary, probe, star map, galactic influence, interstellar fleet, empire sector, and empire legacy — all stored as top-level numeric/boolean fields (progress, readiness, last tick, counts).

## Phase 2 Layer State

### geology

Always-on geology layer state, including deterministic tectonic plates, boundaries, hotspots, geological age, tectonic/volcanic activity, erosion sediment, basin sediment, and continent formation.

### atmosphere

Always-on atmosphere layer state, including gas composition (`co2`, `o2`, `n2`, `ch4`, `h2o`, `o3`, `sulfur`), greenhouse forcing, temperature, volcanic outgassing, photosynthetic oxygen, and oxygen stress.

### microbial

Microbial epoch state, using the selected field/population hybrid.

```json
{
  "model": "field-population-hybrid",
  "ageTicks": 8,
  "fieldWidth": 40,
  "fieldHeight": 22,
  "fields": {
    "density": [0.1],
    "chemicalEnergy": [0.5],
    "oxygenProduction": [0.01],
    "stress": [0.2],
    "bloomIntensity": [0.4]
  },
  "populations": [
    {
      "id": 5,
      "name": "Microbial mat 5",
      "lineageId": "microbial-5",
      "x": 44,
      "y": 22,
      "bloomIntensity": 0.8,
      "morphology": "mat",
      "isVisible": true
    }
  ],
  "nextPopulationId": 6,
  "visibleBlooms": [{ "id": 5, "x": 44, "y": 22, "intensity": 0.8, "morphology": "mat" }],
  "selectedPrototype": "field-population-hybrid"
}
```

## Entity Arrays

### organisms[]
```json
{
  "x": 0, "y": 0,
  "prevX": 0, "prevY": 0,
  "latitude": 0.0, "longitude": 0.0,
  "prevLatitude": 0.0, "prevLongitude": 0.0,
  "energy": 180, "age": 0,
  "directionX": 0, "directionY": 0,
  "travelKm": 0.0,
  "traits": {
    "vision": 20,
    "metabolism": 1,
    "reproductionEnergy": 260,
    "movementTendency": 0.06,
    "terrainAffinity": 0.5,
    "bodySize": 1,
    "limbCount": 4,
    "bodyShape": 0,
    "appendageType": 0,
    "camouflage": 0.25,
    "thermalTolerance": 0.5,
    "waterDependency": 0.5
  },
  "lineageId": 1, "lineageParentId": 0, "generation": 0,
  "speciesId": 1, "populationId": 1, "representativeId": 1
}
```

### food[]
```json
{ "x": 0, "y": 0, "latitude": 0.0, "longitude": 0.0 }
```

### biologyPopulations[]
Aggregate population records for planet-scale biology. These are authoritative for population/species state.

```json
{
  "id": 1,
  "speciesId": 1,
  "lineageId": 1,
  "parentPopulationId": 0,
  "count": 100,
  "biomass": 220,
  "energyReserve": 80,
  "territoryCells": [{ "x": 12, "y": 9, "density": 0.8 }],
  "traitMean": { "vision": 22, "bodySize": 1.2 },
  "traitVariance": { "vision": 2, "bodySize": 0.1 },
  "pressure": { "food": 1, "scarcity": 0.5, "terrain": 0.2, "energyReserve": 110 },
  "representativeIds": [1],
  "createdTick": 0,
  "lastUpdatedTick": 0,
  "isActive": true
}
```

### biologyRepresentatives[]
Persisted watcher-facing representative organisms. Unpinned representatives may be regenerated and do not all need to persist.

```json
{
  "id": 1,
  "populationId": 1,
  "speciesId": 1,
  "lineageId": 1,
  "x": 12,
  "y": 9,
  "latitude": 21.2,
  "longitude": -73.4,
  "energy": 150,
  "age": 12,
  "behavior": "forage",
  "target": { "type": "food", "x": 13, "y": 9 },
  "traits": { "vision": 22, "bodySize": 1.2 },
  "history": [{ "tick": 100, "label": "sampled" }],
  "pinned": true,
  "selected": true,
  "bookmarkScore": 0.8,
  "isActive": true,
  "createdTick": 0,
  "lastSeenTick": 0,
  "lastSelectedTick": 100
}
```

### terrain[]
Flat array of `WORLD_WIDTH * WORLD_HEIGHT` integers. `0` = barren, `1` = fertile.

### lineages[]
```json
{
  "id": 1, "parentId": 0, "createdTick": 0, "founderGeneration": 0,
  "founderTraits": { ... }, "activeCount": 0, "lastSeenTick": 0,
  "peakPopulation": 0, "isExtinct": false
}
```

### settlements[]
24 fields including: id, lineageId, x, y, foundedTick, radius, population, foodStock, storedFood, development, level, lastGrowthTick, influenceRadius, claimedTiles, claimedFood, parentSettlementId, isOutpost, isColony, lastOutpostTick, lastSupplyGrowthTick, isActive, lastActiveTick.

### settlementRoutes[]
```json
{
  "id": 1, "parentSettlementId": 1, "childSettlementId": 2,
  "lineageId": 1, "foundedTick": 0, "distance": 5,
  "foodTransferred": 0, "lastTransferTick": 0, "isActive": true
}
```

### orbitalAssets[]
id, launchNumber, launchedTick, infrastructureScore, orbitAngle, orbitBand, isActive

### planetaryBodies[]
id, name, discoveredTick, surveyValue, orbitAngle, orbitRadius, isSurveyed

### probeMissions[]
id, targetBodyId, launchedTick, arrivalTick, progress, isComplete

### starSystems[]
id, name, discoveredTick, mapValue, mapX, mapY, isMapped, influenceValue, isClaimed, claimedTick

### interstellarFleets[]
id, sourceSystemId, targetSystemId, launchedTick, arrivalTick, progress, isComplete

### empireSectors[]
id, systemId, foundedTick, controlValue, controlRadius, isActive

### traitHistory[]
tick, population, vision, metabolism, reproductionEnergy, movementTendency, terrainAffinity

### ecosystemHistory[]
tick, population, food, averageEnergy, foodPerOrganism, populationBalance, resourceBalance, foodNetThisTick, foodRunwayTicks, pressure, stabilityScore

### eventLog[]
Bounded visible event log. Event fields include tick, type, label, detail, optional details, deepTime, location, source, category, severity, and inspectTarget.

### timelineEvents[]
Durable milestone playback stream. Uses the event fields plus optional `details`, `deepTime`, `source`, `severity`, and `inspectTarget`.

## config{} (Embedded Snapshot)

Full config snapshot embedded in save data by `js/systems/persistence-save-data.js`. Contains all simulation parameters at time of save. Used for reference only — not restored on load.

## Migration Notes for E0 Restructure

1. **Save version stays at 1** until entity storage changes (typed arrays)
2. **Typed array migration** (D3) will require version bump to 2
3. **PS.* namespace** (D4) did not change save format — only function access patterns
4. **Event bus** (D5) won't change save format
5. **WebGPU** (D1) won't change save format — rendering only
6. **Migration function** should be added to persistence.js: `migrateSaveData(data)`
7. **Backward compat**: Version 1 saves should always loadable
