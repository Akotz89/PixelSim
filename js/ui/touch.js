import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { adjustPlanetTouchPinchZoomAtCanvasPoint, panPlanetViewByScreenDelta, setPlanetTouchPinchZoomTargetAtCanvasPoint } from "../render/planet-view.js";
import { getCanvasPointFromClient, markCameraInteracting, planetDragState, redrawPlanetView, zoomPlanetView } from "./camera-input.js";
import { canvas } from "./dom-refs.js";

PS.ui = PS.ui || {};

PS.ui.touch = (function() {
  var state = {
    pointers: {},
    activePinch: false,
    lastDistance: 0,
    startDistance: 0,
    smoothedDistance: 0,
    startZoomLevel: 0,
    smoothedAnchorCanvasX: 0,
    smoothedAnchorCanvasY: 0,
    hasSmoothedAnchor: false,
    pinchUpdateCount: 0,
    lastAngle: 0
  };

  function isTouchPointer(event) {
    return event && String(event.pointerType || "") === "touch";
  }

  function getActivePointers() {
    var touches = [];

    for (var pointerId in state.pointers) {
      if (Object.prototype.hasOwnProperty.call(state.pointers, pointerId)) {
        touches.push(state.pointers[pointerId]);
      }
    }

    return touches;
  }

  function getDistance(first, second) {
    var deltaX = second.clientX - first.clientX;
    var deltaY = second.clientY - first.clientY;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }

  function getAngle(first, second) {
    return Math.atan2(second.clientY - first.clientY, second.clientX - first.clientX);
  }

  function normalizeAngleDelta(delta) {
    while (delta > Math.PI) {
      delta -= Math.PI * 2;
    }

    while (delta < -Math.PI) {
      delta += Math.PI * 2;
    }

    return delta;
  }

  function getMidpoint(first, second) {
    return getCanvasPointFromClient(
      (first.clientX + second.clientX) / 2,
      (first.clientY + second.clientY) / 2
    );
  }

  function getSmoothedMidpoint(first, second, motion) {
    var raw = getMidpoint(first, second);
    var smoothing = clamp(Number(motion && motion.touchPinchAnchorSmoothing) || 0.22, 0.05, 1);
    var deadzone = Math.max(0, Number(motion && motion.touchPinchAnchorDeadzonePx) || 0);

    if (!state.hasSmoothedAnchor) {
      state.smoothedAnchorCanvasX = Number(raw.canvasX) || 0;
      state.smoothedAnchorCanvasY = Number(raw.canvasY) || 0;
      state.hasSmoothedAnchor = true;
      return {
        canvasX: state.smoothedAnchorCanvasX,
        canvasY: state.smoothedAnchorCanvasY
      };
    }

    var rawX = Number(raw.canvasX) || 0;
    var rawY = Number(raw.canvasY) || 0;
    var deltaX = rawX - state.smoothedAnchorCanvasX;
    var deltaY = rawY - state.smoothedAnchorCanvasY;
    var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > deadzone) {
      state.smoothedAnchorCanvasX += deltaX * smoothing;
      state.smoothedAnchorCanvasY += deltaY * smoothing;
    }

    return {
      canvasX: state.smoothedAnchorCanvasX,
      canvasY: state.smoothedAnchorCanvasY
    };
  }

  function stopDragForGesture() {
    if (planetDragState.inertiaHandle !== null && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(planetDragState.inertiaHandle);
      planetDragState.inertiaHandle = null;
    }

    planetDragState.active = false;
    planetDragState.moved = true;
    planetDragState.skipNextClick = true;
    planetDragState.velocityX = 0;
    planetDragState.velocityY = 0;
    canvas.classList.remove("dragging");
  }

  function track(event) {
    if (!isTouchPointer(event) || typeof event.pointerId === "undefined") {
      return false;
    }

    state.pointers[event.pointerId] = {
      clientX: Number(event.clientX) || 0,
      clientY: Number(event.clientY) || 0
    };
    return true;
  }

  function beginIfReady() {
    var touches = getActivePointers();

    if (touches.length < 2) {
      return false;
    }

    state.activePinch = true;
    state.lastDistance = Math.max(1, getDistance(touches[0], touches[1]));
    state.startDistance = state.lastDistance;
    state.smoothedDistance = state.lastDistance;
    state.startZoomLevel = PS.camera && typeof PS.camera.getView === "function"
      ? Number(PS.camera.getView().zoomLevel) || 0
      : 0;
    var midpoint = getMidpoint(touches[0], touches[1]);
    state.smoothedAnchorCanvasX = Number(midpoint.canvasX) || 0;
    state.smoothedAnchorCanvasY = Number(midpoint.canvasY) || 0;
    state.hasSmoothedAnchor = true;
    state.pinchUpdateCount = 0;
    state.lastAngle = getAngle(touches[0], touches[1]);
    stopDragForGesture();
    markCameraInteracting();
    return true;
  }

  function rotateByAngleDelta(delta) {
    var motion = PS.camera && typeof PS.camera.getMotionConfig === "function"
      ? PS.camera.getMotionConfig()
      : { touchRotatePanMultiplier: 10, touchPanInputMaxDelta: 24 };
    var rotateMultiplier = Math.max(0, Number(motion.touchRotatePanMultiplier) || 0);
    var panDelta = clamp(delta * rotateMultiplier, -motion.touchPanInputMaxDelta, motion.touchPanInputMaxDelta);

    if (rotateMultiplier <= 0 || Math.abs(panDelta) <= 0.001 || typeof panPlanetViewByScreenDelta !== "function") {
      return false;
    }

    markCameraInteracting();
    panPlanetViewByScreenDelta(panDelta, 0);
    redrawPlanetView();
    return true;
  }

  function zoomByPinchDelta(delta, midpoint) {
    if (!midpoint) {
      return false;
    }

    if (typeof adjustPlanetTouchPinchZoomAtCanvasPoint === "function") {
      markCameraInteracting();
      return adjustPlanetTouchPinchZoomAtCanvasPoint(delta, midpoint.canvasX, midpoint.canvasY);
    }

    return typeof zoomPlanetView === "function"
      ? zoomPlanetView(delta, midpoint)
      : false;
  }

  function zoomByPinchTarget(targetZoomLevel, midpoint) {
    if (!midpoint) {
      return false;
    }

    if (typeof setPlanetTouchPinchZoomTargetAtCanvasPoint === "function") {
      markCameraInteracting();
      return setPlanetTouchPinchZoomTargetAtCanvasPoint(targetZoomLevel, midpoint.canvasX, midpoint.canvasY);
    }

    var currentZoomLevel = PS.camera && typeof PS.camera.getView === "function"
      ? Number(PS.camera.getView().zoomLevel) || 0
      : state.startZoomLevel;

    return zoomByPinchDelta(targetZoomLevel - currentZoomLevel, midpoint);
  }

  function update(event) {
    if (!track(event) || !state.activePinch) {
      return false;
    }

    var touches = getActivePointers();

    if (touches.length < 2) {
      return false;
    }

    var distance = Math.max(1, getDistance(touches[0], touches[1]));
    var previousDistance = Math.max(1, state.lastDistance || distance);
    var startDistance = Math.max(1, state.startDistance || previousDistance);
    var motion = PS.camera && typeof PS.camera.getMotionConfig === "function"
      ? PS.camera.getMotionConfig()
      : {
        touchPinchZoomMultiplier: 0.45,
        touchPinchZoomMaxDelta: 0.08,
        touchPinchDistanceDeadzonePx: 1.5,
        touchPinchDistanceSmoothing: 0.32
      };
    var rawDistanceDelta = distance - previousDistance;
    var distanceDeadzone = Math.max(0, Number(motion.touchPinchDistanceDeadzonePx) || 0);
    var smoothing = clamp(Number(motion.touchPinchDistanceSmoothing) || 0.32, 0.05, 1);

    if (Math.abs(rawDistanceDelta) < distanceDeadzone) {
      state.lastDistance = distance;
      planetDragState.skipNextClick = true;
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      return true;
    }

    var angle = getAngle(touches[0], touches[1]);
    var angleDelta = normalizeAngleDelta(angle - state.lastAngle);

    if (state.pinchUpdateCount <= 0) {
      state.lastDistance = distance;
      state.lastAngle = angle;
      state.pinchUpdateCount += 1;
      planetDragState.skipNextClick = true;
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      return true;
    }

    state.smoothedDistance = Math.max(
      1,
      (Number(state.smoothedDistance) || previousDistance) + (distance - (Number(state.smoothedDistance) || previousDistance)) * smoothing
    );

    var ratio = state.smoothedDistance / previousDistance;
    var gestureRatio = state.smoothedDistance / startDistance;
    var zoomDelta = clamp(
      Math.log(ratio) * motion.touchPinchZoomMultiplier,
      -motion.touchPinchZoomMaxDelta,
      motion.touchPinchZoomMaxDelta
    );
    var targetZoomLevel = state.startZoomLevel + Math.log(gestureRatio) * motion.touchPinchZoomMultiplier;

    state.lastDistance = distance;
    state.lastAngle = angle;
    state.pinchUpdateCount += 1;
    planetDragState.skipNextClick = true;

    if (Math.abs(zoomDelta) > 0.001) {
      zoomByPinchTarget(targetZoomLevel, getSmoothedMidpoint(touches[0], touches[1], motion));
    }

    rotateByAngleDelta(angleDelta);

    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    return true;
  }

  function end(event) {
    if (!isTouchPointer(event) || typeof event.pointerId === "undefined") {
      return false;
    }

    delete state.pointers[event.pointerId];

    if (state.activePinch) {
      planetDragState.skipNextClick = true;
    }

    if (getActivePointers().length < 2) {
      state.activePinch = false;
      state.lastDistance = 0;
      state.startDistance = 0;
      state.smoothedDistance = 0;
      state.startZoomLevel = 0;
      state.smoothedAnchorCanvasX = 0;
      state.smoothedAnchorCanvasY = 0;
      state.hasSmoothedAnchor = false;
      state.pinchUpdateCount = 0;
      state.lastAngle = 0;
      if (PS.camera && typeof PS.camera.stopTouchPinchZoom === "function") {
        PS.camera.stopTouchPinchZoom();
      }
    }

    return true;
  }

  function prepare() {
    if (canvas && canvas.style) {
      canvas.style.touchAction = "none";
    }
  }

  return {
    beginIfReady: beginIfReady,
    end: end,
    prepare: prepare,
    track: track,
    update: update
  };
})();

