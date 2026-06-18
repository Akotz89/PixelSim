"use strict";
import { PS } from "../core/namespace.js";

PS.render = PS.render || {};
PS.render.tileTypeLut = PS.render.tileTypeLut || {};

PS.render.tileTypeLut.state = PS.render.tileTypeLut.state || {
  keyIds: {},
  nextKeyId: 1,
  terrainKeyLookups: 0,
  acceptedKeyLookups: 0,
  parcelKeyLookups: 0
};

PS.render.tileTypeLut.getStableKeyId = function (value) {
  var state = PS.render.tileTypeLut.state;
  var key = String(value || "");
  var id = state.keyIds[key];

  if (!id) {
    id = state.nextKeyId++;
    state.keyIds[key] = id;
  }

  return id;
};

PS.render.tileTypeLut.hashKeyId = function (hash, id) {
  var value = Number(id) || 0;
  var result = hash >>> 0;

  result ^= value & 0xffff;
  result = Math.imul(result, 16777619);
  result ^= (value >>> 16) & 0xffff;
  result = Math.imul(result, 16777619);
  return result >>> 0;
};

PS.render.tileTypeLut.combineKeyIds = function (ids) {
  var list = Array.isArray(ids) ? ids : [];
  var hash = 2166136261;

  for (var i = 0; i < list.length; i += 1) {
    hash = PS.render.tileTypeLut.hashKeyId(hash, list[i]);
  }

  return hash >>> 0;
};

PS.render.tileTypeLut.getTerrainAtlasKeyId = function (
  ecologyKey,
  ecologyMicroKey,
  transitionKey,
  stencilKey,
  featureKey,
  moistureKey,
  eraKey,
  biologyKey,
  resourceKey,
  civilizationKey
) {
  var lut = PS.render.tileTypeLut;
  var hash = 2166136261;

  hash = lut.hashKeyId(hash, lut.getStableKeyId(ecologyKey));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(ecologyMicroKey));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(transitionKey));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(stencilKey));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(featureKey));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(moistureKey));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(eraKey));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(biologyKey));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(resourceKey));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(civilizationKey));
  lut.state.terrainKeyLookups += 1;
  return hash >>> 0;
};

PS.render.tileTypeLut.getAcceptedKeyId = function (atlasKeyId, acceptedCellKey) {
  var lut = PS.render.tileTypeLut;
  var hash = 2166136261;

  hash = lut.hashKeyId(hash, atlasKeyId);
  hash = lut.hashKeyId(hash, lut.getStableKeyId("equiv"));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(acceptedCellKey));
  lut.state.acceptedKeyLookups += 1;
  return hash >>> 0;
};

PS.render.tileTypeLut.getSettlementParcelKeyId = function (atlasKeyId, info, density) {
  var lut = PS.render.tileTypeLut;
  var civilization = info || {};
  var hash = 2166136261;

  hash = lut.hashKeyId(hash, atlasKeyId);
  hash = lut.hashKeyId(hash, lut.getStableKeyId("settlement-parcel-fill"));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(civilization.type));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(civilization.family));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(civilization.bucket));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(civilization.lineageId));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(Math.round((Number(civilization.pressure) || 0) * 1000)));
  hash = lut.hashKeyId(hash, lut.getStableKeyId(Math.round((Number(density) || 0) * 1000)));
  lut.state.parcelKeyLookups += 1;
  return hash >>> 0;
};

PS.render.tileTypeLut.getStats = function () {
  var state = PS.render.tileTypeLut.state;

  return {
    registeredKeys: Object.keys(state.keyIds).length,
    terrainKeyLookups: state.terrainKeyLookups,
    acceptedKeyLookups: state.acceptedKeyLookups,
    parcelKeyLookups: state.parcelKeyLookups
  };
};
