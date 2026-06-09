"use strict";
self.onmessage = function (event) {
  var message = event.data || {};

  if (message.type === "ping") {
    self.postMessage({
      type: "pong",
      id: message.id || 0
    });
    return;
  }

  if (message.type !== "buildSurfaceChunkBase") {
    self.postMessage({
      type: "error",
      id: message.id || 0,
      message: "Unknown surface worker message type"
    });
    return;
  }

  var startedAt = performance.now();
  var width = Math.max(1, Math.round(Number(message.width) || 1));
  var height = Math.max(1, Math.round(Number(message.height) || 1));
  var tileSize = Math.max(1, Math.round(Number(message.tileSize) || 1));
  var cells = Array.isArray(message.cells) ? message.cells : [];
  var buffer = new ArrayBuffer(width * height * 4);
  var data = new Uint8ClampedArray(buffer);

  for (var i = 0; i < cells.length; i++) {
    var cell = cells[i] || {};
    var pixelX = Math.max(0, Math.round(Number(cell.pixelX) || 0));
    var pixelY = Math.max(0, Math.round(Number(cell.pixelY) || 0));
    var packedColor = Math.max(0, Math.round(Number(cell.packedColor) || 0));
    var patches = Array.isArray(cell.patches) && cell.patches.length > 0
      ? cell.patches
      : [{ pixelX: 0, pixelY: 0, width: tileSize, height: tileSize, packedColor: packedColor }];

    for (var p = 0; p < patches.length; p++) {
      var patch = patches[p] || {};
      var patchColor = Math.max(0, Math.round(Number(patch.packedColor) || packedColor));
      var red = (patchColor >> 16) & 255;
      var green = (patchColor >> 8) & 255;
      var blue = patchColor & 255;
      var patchX = pixelX + Math.max(0, Math.round(Number(patch.pixelX) || 0));
      var patchY = pixelY + Math.max(0, Math.round(Number(patch.pixelY) || 0));
      var patchWidth = Math.max(1, Math.round(Number(patch.width) || tileSize));
      var patchHeight = Math.max(1, Math.round(Number(patch.height) || tileSize));

      for (var y = 0; y < patchHeight; y++) {
        var row = patchY + y;

        if (row < 0 || row >= height) {
          continue;
        }

        var offset = (row * width + patchX) * 4;

        for (var x = 0; x < patchWidth; x++) {
          if (patchX + x >= width) {
            break;
          }

          data[offset] = red;
          data[offset + 1] = green;
          data[offset + 2] = blue;
          data[offset + 3] = 255;
          offset += 4;
        }
      }
    }
  }

  self.postMessage({
    type: "surfaceChunkBase",
    id: message.id || 0,
    key: message.key || "",
    width: width,
    height: height,
    workerMs: performance.now() - startedAt,
    buffer: buffer
  }, [buffer]);
};
