"use strict";
const canvas = document.getElementById("game-webgpu");

const gameWrap = document.getElementById("game-wrap");
const uiMenu = document.getElementById("ui-menu");
const menuBackdrop = document.getElementById("menu-backdrop");
const menuToggleButton = document.getElementById("menu-toggle-button");
const menuToggleText = menuToggleButton.querySelector(".menu-toggle-text");
const menuTabs = document.getElementById("menu-tabs");
const eraText = document.getElementById("era");
const populationText = document.getElementById("population");
const foodText = document.getElementById("food");
const ecosystemSummaryText = document.getElementById("ecosystem-summary");
const simulationAlertsText = document.getElementById("simulation-alerts");
const inspectSummaryText = document.getElementById("inspect-summary");
const inspectDetailsText = document.getElementById("inspect-details");
const traitSummaryText = document.getElementById("trait-summary");
const lineageSummaryText = document.getElementById("lineage-summary");
const evolutionTreeFilterButtons = typeof document.querySelectorAll === "function"
  ? document.querySelectorAll("[data-evolution-tree-filter]")
  : [];
const evolutionTreeActionButtons = typeof document.querySelectorAll === "function"
  ? document.querySelectorAll("[data-evolution-tree-action]")
  : [];
const evolutionTreeView = document.getElementById("evolution-tree-view");
const settlementSummaryText = document.getElementById("settlement-summary");
const eventLogText = document.getElementById("event-log");
const observationOverlayButtons = typeof document.querySelectorAll === "function"
  ? document.querySelectorAll("[data-observation-overlay]")
  : [];
const observationOverlayStatus = document.getElementById("observation-overlay-status");
const timelineFilterButtons = typeof document.querySelectorAll === "function"
  ? document.querySelectorAll("[data-timeline-filter]")
  : [];
const timelineList = document.getElementById("timeline-list");
const bookmarkLabelInput = document.getElementById("bookmark-label-input");
const bookmarkNoteInput = document.getElementById("bookmark-note-input");
const bookmarkAddButton = document.getElementById("bookmark-add-button");
const bookmarkList = document.getElementById("bookmark-list");
const ecosystemHistoryCanvas = document.getElementById("ecosystem-history");
const traitHistoryCanvas = document.getElementById("trait-history");

const pauseButton = document.getElementById("pause-button");
const stepButton = document.getElementById("step-button");
const speedDownButton = document.getElementById("speed-down-button");
const speedUpButton = document.getElementById("speed-up-button");
const restartButton = document.getElementById("restart-button");
const saveButton = document.getElementById("save-button");
const loadButton = document.getElementById("load-button");
const exportJsonButton = document.getElementById("export-json-button");
const importJsonButton = document.getElementById("import-json-button");
const importJsonFile = document.getElementById("import-json-file");
const captureModeSelect = document.getElementById("capture-mode-select");
const captureBookmarkCheckbox = document.getElementById("capture-bookmark-checkbox");
const screenshotExportButton = document.getElementById("screenshot-export-button");
const recordingExportButton = document.getElementById("recording-export-button");
const speedLabel = document.getElementById("speed-label");
const persistenceStatus = document.getElementById("persistence-status");
const speedSlider = document.getElementById("speed-slider");
const speedValue = document.getElementById("speed-value");
const timeScaleSlider = document.getElementById("time-scale-slider");
const timeScaleValue = document.getElementById("time-scale-value");
const organismSizeSlider = document.getElementById("organism-size-slider");
const organismSizeValue = document.getElementById("organism-size-value");
const foodSizeSlider = document.getElementById("food-size-slider");
const foodSizeValue = document.getElementById("food-size-value");
const startingFoodSlider = document.getElementById("starting-food-slider");
const startingFoodValue = document.getElementById("starting-food-value");
const foodGrowthSlider = document.getElementById("food-growth-slider");
const foodGrowthValue = document.getElementById("food-growth-value");
const seedInput = document.getElementById("seed-input");
const seedRandomButton = document.getElementById("seed-random-button");
const controlsPanel = document.getElementById("controls");
const spotlightPanel = document.getElementById("spotlight-panel");
const spotlightTitle = document.getElementById("spotlight-title");
const spotlightDetail = document.getElementById("spotlight-detail");
const spotlightInvestigateButton = document.getElementById("spotlight-investigate-button");
const spotlightDismissButton = document.getElementById("spotlight-dismiss-button");
