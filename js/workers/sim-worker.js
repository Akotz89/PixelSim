"use strict";
self.onmessage = function(event) {
  var message = event.data || {};

  if (message.type === "ping") {
    self.postMessage({
      type: "pong",
      id: message.id || 0,
      crossOriginIsolated: Boolean(self.crossOriginIsolated),
      hasSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined"
    });
    return;
  }

  if (message.type !== "tick") {
    self.postMessage({
      type: "error",
      id: message.id || 0,
      message: "Unknown worker message type"
    });
    return;
  }

  var startedAt = performance.now();
  var count = Math.max(0, Math.round(Number(message.count) || 0));
  var width = Math.max(1, Math.round(Number(message.width) || 1));
  var height = Math.max(1, Math.round(Number(message.height) || 1));
  var dt = Math.max(0, Number(message.dt) || 0);
  var x = new Float32Array(message.x);
  var y = new Float32Array(message.y);
  var energy = new Float32Array(message.energy);
  var directionX = new Float32Array(message.directionX);
  var directionY = new Float32Array(message.directionY);
  var age = new Float32Array(message.age);
  var consumed = 0;

  for (var i = 0; i < count; i++) {
    var nextX = x[i] + directionX[i];
    var nextY = y[i] + directionY[i];

    if (nextX < 0) {
      nextX += width;
    } else if (nextX >= width) {
      nextX -= width;
    }

    if (nextY < 0) {
      nextY = 0;
      directionY[i] = 1;
    } else if (nextY >= height) {
      nextY = height - 1;
      directionY[i] = -1;
    }

    x[i] = nextX;
    y[i] = nextY;
    age[i] += 1;
    energy[i] = Math.max(0, energy[i] - 0.01 * dt);

    if (energy[i] === 0) {
      consumed++;
    }
  }

  self.postMessage({
    type: "tickComplete",
    id: message.id || 0,
    count: count,
    consumed: consumed,
    workerMs: performance.now() - startedAt,
    x: x.buffer,
    y: y.buffer,
    energy: energy.buffer,
    directionX: directionX.buffer,
    directionY: directionY.buffer,
    age: age.buffer
  }, [
    x.buffer,
    y.buffer,
    energy.buffer,
    directionX.buffer,
    directionY.buffer,
    age.buffer
  ]);
};
