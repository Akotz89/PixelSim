import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { normalizeSeedText } from "../core/utils.js";
import { world } from "../systems/state.js";
import { updateHud } from "./foundation.js";

PS.ui = PS.ui || {};

PS.ui.hud = {
  seedButton: null,
  setup: function() {
    this.seedButton = document.getElementById("seed-copy-button");

    if (this.seedButton && this.seedButton.dataset.bound !== "true") {
      this.seedButton.dataset.bound = "true";
      this.seedButton.addEventListener("click", this.copySeed.bind(this));
      this.updateSeedDisplay();
    }
  },
  update: function() {
    return typeof updateHud === "function" ? updateHud() : null;
  },
  updateSeedDisplay: function() {
    if (!this.seedButton) {
      this.seedButton = document.getElementById("seed-copy-button");
    }

    if (!this.seedButton) {
      return;
    }

    var seedText = normalizeSeedText(world.seedText || CONFIG.DEFAULT_SEED);
    this.seedButton.textContent = "Seed " + seedText;
    this.seedButton.title = "Copy seed " + seedText;
    this.seedButton.setAttribute("aria-label", "Copy current seed " + seedText);
  },
  copySeed: function() {
    var seedText = normalizeSeedText(world.seedText || CONFIG.DEFAULT_SEED);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(seedText);
    }

    if (PS.ui.notifications) {
      PS.ui.notifications.show("Seed copied", seedText, "info");
    }

    return seedText;
  }
};
