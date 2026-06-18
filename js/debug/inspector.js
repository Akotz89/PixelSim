import { PS } from "../core/namespace.js";
import { getPlanetTile } from "../render/planet-grid.js";

PS.debug = PS.debug || {};

PS.debug.inspector = {
  element: null,
  setup: function() {
    this.element = document.getElementById("debug-inspector");
  },
  inspect: function(tileX, tileY, surfacePosition) {
    if (!this.element) {
      this.element = document.getElementById("debug-inspector");
    }

    if (!this.element) {
      return null;
    }

    var organism = PS.sim && PS.sim.organisms ? PS.sim.organisms.nearestInRadius(tileX, tileY, 1) : null;
    var food = PS.sim && PS.sim.food ? PS.sim.food.findAt(tileX, tileY) : null;
    var tile = getPlanetTile(tileX, tileY);
    this.element.hidden = false;
    this.element.textContent = JSON.stringify({
      tile: { x: tileX, y: tileY, biome: tile ? tile.biome : null },
      surface: surfacePosition || null,
      organism: organism ? { energy: organism.energy, age: organism.age, lineageId: organism.lineageId } : null,
      food: Boolean(food)
    }, null, 2);
    return this.element.textContent;
  }
};
