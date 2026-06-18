import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getPlanetTileFromCanvasPoint } from "../render/planet-grid.js";
import { adjustPlanetZoom, adjustPlanetZoomAtCanvasPoint, getPlanetLatLonFromCanvasPoint, panPlanetViewBySamples, panPlanetViewByScreenDelta } from "../render/planet-view.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";
import { canvas } from "./dom-refs.js";

export var planetDragState = {
  active: false,
  moved: false,
  skipNextClick: false,
  lastClientX: 0,
  lastClientY: 0,
  velocityX: 0,
  velocityY: 0,
  lastMoveTime: 0,
  inertiaHandle: null
};
export var cameraInteractionTimer = null;

export function markCameraInteracting() {
  world.isCameraInteracting = true;

  if (cameraInteractionTimer !== null && typeof window.clearTimeout === "function") {
    window.clearTimeout(cameraInteractionTimer);
  }

  if (typeof window.setTimeout === "function") {
    cameraInteractionTimer = window.setTimeout(function() {
      world.isCameraInteracting = false;
      cameraInteractionTimer = null;
      if (PS.render && PS.render.terrain && typeof PS.render.terrain.invalidateCache === "function") {
        PS.render.terrain.invalidateCache();
      }
      world.needsRender = true;
    }, Math.max(40, Number(CONFIG.PLANET_CAMERA_INTERACTION_SETTLE_MS) || 140));
  }
}

export function getCanvasPointFromEvent(event) {
  return getCanvasPointFromClient(event.clientX, event.clientY);
}

export function getCanvasPointFromClient(clientX, clientY) {
  return PS.camera && PS.camera.unified
    ? PS.camera.unified.clientToScreen(clientX, clientY)
    : { canvasX: Number(clientX) || 0, canvasY: Number(clientY) || 0 };
}

export function getTileFromCanvasEvent(event) {
  var point = getCanvasPointFromEvent(event);
  var planetTile = typeof getPlanetTileFromCanvasPoint === "function"
    ? getPlanetTileFromCanvasPoint(point.canvasX, point.canvasY)
    : null;

  if (planetTile) {
    return planetTile;
  }

  return {
    x: clamp(Math.floor(point.canvasX / CONFIG.TILE_SIZE), 0, WORLD_WIDTH - 1),
    y: clamp(Math.floor(point.canvasY / CONFIG.TILE_SIZE), 0, WORLD_HEIGHT - 1)
  };
}

export function getSurfacePositionFromCanvasEvent(event) {
  if (typeof getPlanetLatLonFromCanvasPoint !== "function") {
    return null;
  }

  var point = getCanvasPointFromEvent(event);
  return getPlanetLatLonFromCanvasPoint(point.canvasX, point.canvasY);
}

export function zoomPlanetView(delta, anchorPoint) {
  markCameraInteracting();

  var didZoom = anchorPoint && typeof adjustPlanetZoomAtCanvasPoint === "function"
    ? adjustPlanetZoomAtCanvasPoint(delta, anchorPoint.canvasX, anchorPoint.canvasY)
    : adjustPlanetZoom(delta);

  if (!didZoom) {
    return false;
  }

  world.needsRender = true;
  return true;
}

export function redrawPlanetView() {
  world.needsRender = true;
}

export function beginPlanetDrag(event) {
  if (typeof event.button === "number" && event.button !== 0) {
    return;
  }

  if (PS.ui.touch.track(event) && PS.ui.touch.beginIfReady()) {
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    return;
  }

  planetDragState.active = true;
  planetDragState.moved = false;
  planetDragState.lastClientX = Number(event.clientX) || 0;
  planetDragState.lastClientY = Number(event.clientY) || 0;
  planetDragState.velocityX = 0;
  planetDragState.velocityY = 0;
  planetDragState.lastMoveTime = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  canvas.classList.add("dragging");

  if (planetDragState.inertiaHandle !== null && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(planetDragState.inertiaHandle);
    planetDragState.inertiaHandle = null;
  }

  if (typeof canvas.setPointerCapture === "function" && typeof event.pointerId !== "undefined") {
    canvas.setPointerCapture(event.pointerId);
  }
}

export function updatePlanetDrag(event) {
  if (PS.ui.touch.update(event)) {
    return;
  }

  if (!planetDragState.active) {
    return;
  }

  var clientX = Number(event.clientX) || 0;
  var clientY = Number(event.clientY) || 0;
  var now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  var deltaX = clientX - planetDragState.lastClientX;
  var deltaY = clientY - planetDragState.lastClientY;
  var elapsed = Math.max(1, now - planetDragState.lastMoveTime);
  var isTouchPointer = event && String(event.pointerType || "") === "touch";
  var motion = PS.camera && typeof PS.camera.getMotionConfig === "function"
    ? PS.camera.getMotionConfig()
    : { panInputMaxDelta: 64, panMaxSpeed: 14 };
  var inputMaxDelta = isTouchPointer && Number(motion.touchPanInputMaxDelta)
    ? motion.touchPanInputMaxDelta
    : motion.panInputMaxDelta;
  var inputMultiplier = isTouchPointer && Number(motion.touchPanMultiplier)
    ? motion.touchPanMultiplier
    : 1;
  var clampedDeltaX = PS.camera && typeof PS.camera.clampInputDelta === "function"
    ? PS.camera.clampInputDelta(deltaX, inputMaxDelta) * inputMultiplier
    : clamp(deltaX, -24, 24) * inputMultiplier;
  var clampedDeltaY = PS.camera && typeof PS.camera.clampInputDelta === "function"
    ? PS.camera.clampInputDelta(deltaY, inputMaxDelta) * inputMultiplier
    : clamp(deltaY, -24, 24) * inputMultiplier;

  if (deltaX === 0 && deltaY === 0) {
    return;
  }

  planetDragState.lastClientX = clientX;
  planetDragState.lastClientY = clientY;
  planetDragState.lastMoveTime = now;
  planetDragState.velocityX = PS.camera && typeof PS.camera.clampVelocity === "function"
    ? PS.camera.clampVelocity(clampedDeltaX / elapsed * 16, motion.panMaxSpeed)
    : clampedDeltaX / elapsed * 16;
  planetDragState.velocityY = PS.camera && typeof PS.camera.clampVelocity === "function"
    ? PS.camera.clampVelocity(clampedDeltaY / elapsed * 16, motion.panMaxSpeed)
    : clampedDeltaY / elapsed * 16;

  if (Math.abs(deltaX) + Math.abs(deltaY) > 2) {
    planetDragState.moved = true;
  }

  if (typeof panPlanetViewByScreenDelta === "function") {
    markCameraInteracting();
    panPlanetViewByScreenDelta(clampedDeltaX, clampedDeltaY);
    redrawPlanetView();
  }

  if (typeof event.preventDefault === "function") {
    event.preventDefault();
  }
}

export function continuePlanetDragInertia() {
  var velocityX = planetDragState.velocityX * 0.86;
  var velocityY = planetDragState.velocityY * 0.86;

  planetDragState.velocityX = velocityX;
  planetDragState.velocityY = velocityY;

  if (Math.abs(velocityX) + Math.abs(velocityY) < 0.35 || planetDragState.active) {
    planetDragState.inertiaHandle = null;
    return;
  }

  if (typeof panPlanetViewByScreenDelta === "function") {
    markCameraInteracting();
    panPlanetViewByScreenDelta(velocityX, velocityY);
    redrawPlanetView();
  }

  if (typeof window.requestAnimationFrame === "function") {
    planetDragState.inertiaHandle = window.requestAnimationFrame(continuePlanetDragInertia);
  } else {
    planetDragState.inertiaHandle = null;
  }
}

export function endPlanetDrag(event) {
  if (PS.ui.touch.end(event)) {
    if (!planetDragState.active) {
      return;
    }
  }

  if (!planetDragState.active) {
    return;
  }

  planetDragState.active = false;
  planetDragState.skipNextClick = planetDragState.moved;
  canvas.classList.remove("dragging");

  if (typeof canvas.releasePointerCapture === "function" && event && typeof event.pointerId !== "undefined") {
    canvas.releasePointerCapture(event.pointerId);
  }

  planetDragState.inertiaHandle = null;
}

export function panPlanetViewFromKeyboard(eastSamples, northSamples) {
  if (typeof panPlanetViewBySamples !== "function") {
    return false;
  }

  panPlanetViewBySamples(eastSamples, northSamples);
  markCameraInteracting();
  redrawPlanetView();
  return true;
}

export function prepareTouchInput() {
  PS.ui.touch.prepare();
}

