"use strict";
var PS = window.PS || {};
window.PS = PS;

PS.ui = PS.ui || {};

PS.ui.touch = (function() {
  var state = {
    pointers: {},
    activePinch: false,
    lastDistance: 0,
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
    state.lastAngle = getAngle(touches[0], touches[1]);
    stopDragForGesture();
    markCameraInteracting();
    return true;
  }

  function rotateByAngleDelta(delta) {
    if (Math.abs(delta) <= 0.001 || typeof panPlanetViewByScreenDelta !== "function") {
      return false;
    }

    markCameraInteracting();
    panPlanetViewByScreenDelta(delta * 180, 0);
    redrawPlanetView();
    return true;
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
    var ratio = distance / previousDistance;
    var zoomDelta = clamp(Math.log(ratio) * 1.4, -0.35, 0.35);
    var angle = getAngle(touches[0], touches[1]);
    var angleDelta = normalizeAngleDelta(angle - state.lastAngle);

    state.lastDistance = distance;
    state.lastAngle = angle;
    planetDragState.skipNextClick = true;

    if (Math.abs(zoomDelta) > 0.001) {
      zoomPlanetView(zoomDelta, getMidpoint(touches[0], touches[1]));
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
      state.lastAngle = 0;
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
