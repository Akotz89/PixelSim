function getInspectSurfacePosition(tileX, tileY) {
  var surfacePosition = world.inspectedSurface;

  if (
    surfacePosition &&
    Number.isFinite(Number(surfacePosition.latitude)) &&
    Number.isFinite(Number(surfacePosition.longitude))
  ) {
    var surfaceTile = getTileFromLatLon(surfacePosition.latitude, surfacePosition.longitude);

    if (surfaceTile.x === tileX && surfaceTile.y === tileY) {
      return {
        latitude: clamp(Number(surfacePosition.latitude), -90, 90),
        longitude: normalizeLongitude(surfacePosition.longitude)
      };
    }
  }

  return null;
}

function getInspectSurfacePositionLabel(tileX, tileY) {
  var surfacePosition = getInspectSurfacePosition(tileX, tileY);

  if (!surfacePosition) {
    return "-";
  }

  return surfacePosition.latitude.toFixed(5) + " / " + surfacePosition.longitude.toFixed(5);
}

function getInspectableEntityFromTile(tileX, tileY) {
  var settlement = getNearestSettlementToTile(tileX, tileY);
  var organism = getNearestOrganismToTile(tileX, tileY);

  if (settlement && Math.abs(settlement.x - tileX) + Math.abs(settlement.y - tileY) <= 1) {
    return {
      type: settlement.isColony ? "colony" : (settlement.isOutpost ? "outpost" : "settlement"),
      id: settlement.id,
      lineageId: settlement.lineageId,
      x: settlement.x,
      y: settlement.y
    };
  }

  if (organism && Math.abs(organism.x - tileX) + Math.abs(organism.y - tileY) <= 1) {
    var representative = PS.sim.representatives && PS.sim.representatives.syncOrganism
      ? PS.sim.representatives.syncOrganism(organism, { selected: true })
      : null;

    return {
      type: "organism",
      lineageId: ensureOrganismLineage(organism),
      speciesId: organism.speciesId,
      populationId: organism.populationId,
      representativeId: organism.representativeId,
      pinned: representative ? representative.pinned : false,
      bookmarkScore: representative ? representative.bookmarkScore : 0,
      generation: organism.generation,
      energy: organism.energy,
      x: organism.x,
      y: organism.y
    };
  }

  if (foodExistsAt(tileX, tileY)) {
    return {
      type: "food",
      x: tileX,
      y: tileY
    };
  }

  return null;
}

function inspectTile(tileX, tileY, shouldFocus, surfacePosition, inspectedEntity) {
  world.inspectedTile = {
    x: clamp(tileX, 0, WORLD_WIDTH - 1),
    y: clamp(tileY, 0, WORLD_HEIGHT - 1)
  };
  world.inspectedSurface = surfacePosition || null;
  world.inspectedEntity = inspectedEntity || getInspectableEntityFromTile(world.inspectedTile.x, world.inspectedTile.y);

  if (
    world.inspectedEntity &&
    world.inspectedEntity.representativeId &&
    PS.sim.representatives &&
    PS.sim.representatives.select
  ) {
    PS.sim.representatives.select(world.inspectedEntity.representativeId);
  }

  if (shouldFocus !== false && !isPlanetLocalView()) {
    focusPlanetViewOnTile(world.inspectedTile.x, world.inspectedTile.y);
  }

  world.needsRender = true;
  updateHud();
}
