"use strict";
export const canvas = document.getElementById("game-webgpu");

export const gameWrap = document.getElementById("game-wrap");
export const uiMenu = document.getElementById("ui-menu");
export const menuBackdrop = document.getElementById("menu-backdrop");
export const menuToggleButton = document.getElementById("menu-toggle-button");
export const menuToggleText = menuToggleButton.querySelector(".menu-toggle-text");
export const menuTabs = document.getElementById("menu-tabs");
export const eraText = document.getElementById("era");
export const populationText = document.getElementById("population");
export const foodText = document.getElementById("food");
export const ecosystemSummaryText = document.getElementById("ecosystem-summary");
export const simulationAlertsText = document.getElementById("simulation-alerts");
export const inspectSummaryText = document.getElementById("inspect-summary");
export const inspectDetailsText = document.getElementById("inspect-details");
export const traitSummaryText = document.getElementById("trait-summary");
export const lineageSummaryText = document.getElementById("lineage-summary");
export const evolutionTreeFilterButtons = typeof document.querySelectorAll === "function"
  ? document.querySelectorAll("[data-evolution-tree-filter]")
  : [];
export const evolutionTreeActionButtons = typeof document.querySelectorAll === "function"
  ? document.querySelectorAll("[data-evolution-tree-action]")
  : [];
export const evolutionTreeView = document.getElementById("evolution-tree-view");
export const settlementSummaryText = document.getElementById("settlement-summary");
export const eventLogText = document.getElementById("event-log");
export const observationOverlayButtons = typeof document.querySelectorAll === "function"
  ? document.querySelectorAll("[data-observation-overlay]")
  : [];
export const observationOverlayStatus = document.getElementById("observation-overlay-status");
export const timelineFilterButtons = typeof document.querySelectorAll === "function"
  ? document.querySelectorAll("[data-timeline-filter]")
  : [];
export const timelineList = document.getElementById("timeline-list");
export const bookmarkLabelInput = document.getElementById("bookmark-label-input");
export const bookmarkNoteInput = document.getElementById("bookmark-note-input");
export const bookmarkAddButton = document.getElementById("bookmark-add-button");
export const bookmarkList = document.getElementById("bookmark-list");
export const ecosystemHistoryCanvas = document.getElementById("ecosystem-history");
export const traitHistoryCanvas = document.getElementById("trait-history");

export const pauseButton = document.getElementById("pause-button");
export const stepButton = document.getElementById("step-button");
export const speedDownButton = document.getElementById("speed-down-button");
export const speedUpButton = document.getElementById("speed-up-button");
export const restartButton = document.getElementById("restart-button");
export const saveButton = document.getElementById("save-button");
export const loadButton = document.getElementById("load-button");
export const exportJsonButton = document.getElementById("export-json-button");
export const importJsonButton = document.getElementById("import-json-button");
export const importJsonFile = document.getElementById("import-json-file");
export const captureModeSelect = document.getElementById("capture-mode-select");
export const captureBookmarkCheckbox = document.getElementById("capture-bookmark-checkbox");
export const screenshotExportButton = document.getElementById("screenshot-export-button");
export const recordingExportButton = document.getElementById("recording-export-button");
export const speedLabel = document.getElementById("speed-label");
export const persistenceStatus = document.getElementById("persistence-status");
export const speedSlider = document.getElementById("speed-slider");
export const speedValue = document.getElementById("speed-value");
export const timeScaleSlider = document.getElementById("time-scale-slider");
export const timeScaleValue = document.getElementById("time-scale-value");
export const organismSizeSlider = document.getElementById("organism-size-slider");
export const organismSizeValue = document.getElementById("organism-size-value");
export const foodSizeSlider = document.getElementById("food-size-slider");
export const foodSizeValue = document.getElementById("food-size-value");
export const startingFoodSlider = document.getElementById("starting-food-slider");
export const startingFoodValue = document.getElementById("starting-food-value");
export const foodGrowthSlider = document.getElementById("food-growth-slider");
export const foodGrowthValue = document.getElementById("food-growth-value");
export const seedInput = document.getElementById("seed-input");
export const seedRandomButton = document.getElementById("seed-random-button");
export const controlsPanel = document.getElementById("controls");
export const spotlightPanel = document.getElementById("spotlight-panel");
export const spotlightTitle = document.getElementById("spotlight-title");
export const spotlightDetail = document.getElementById("spotlight-detail");
export const spotlightInvestigateButton = document.getElementById("spotlight-investigate-button");
export const spotlightDismissButton = document.getElementById("spotlight-dismiss-button");
