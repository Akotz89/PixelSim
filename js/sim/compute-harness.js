"use strict";
import { PS } from "../core/namespace.js";

PS.sim = PS.sim || {};

PS.sim.computeHarness = PS.sim.computeHarness || {
  buffers: {},
  pingPongs: {},
  states: {},
  passes: {},
  dispatchLog: [],
  bindGroupSerial: 0,

  usage: {
    storage: 128,
    uniform: 64,
    copySrc: 4,
    copyDst: 8,
    mapRead: 1
  },

  getDevice: function (device) {
    return device || (PS.gpu && PS.gpu.device);
  },

  getQueue: function () {
    return PS.gpu && PS.gpu.queue ? PS.gpu.queue : null;
  },

  getUsage: function (parts) {
    var values = Array.isArray(parts) ? parts : [parts];
    var total = 0;

    for (var i = 0; i < values.length; i += 1) {
      if (typeof values[i] === "number") {
        total |= values[i];
      } else if (this.usage[String(values[i])] !== undefined) {
        total |= this.usage[String(values[i])];
      }
    }

    return total;
  },

  normalizeSize: function (byteLength) {
    return Math.max(4, Math.ceil((Number(byteLength) || 4) / 4) * 4);
  },

  createBuffer: function (id, byteLength, usage, initialData, device) {
    var bufferId = String(id || "").trim();
    var targetDevice = this.getDevice(device);
    var size = this.normalizeSize(byteLength);
    var gpuUsage = this.getUsage(usage || ["storage", "copySrc", "copyDst"]);
    var buffer;

    if (!bufferId) {
      throw new Error("Compute buffer id is required");
    }

    if (!targetDevice || typeof targetDevice.createBuffer !== "function") {
      throw new Error("GPUDevice.createBuffer is required for compute buffers");
    }

    buffer = targetDevice.createBuffer({
      label: bufferId,
      size: size,
      usage: gpuUsage,
      mappedAtCreation: false
    });

    this.bindGroupSerial += 1;
    this.buffers[bufferId] = {
      id: bufferId,
      byteLength: size,
      usage: gpuUsage,
      buffer: buffer,
      bindGroupId: bufferId + "#" + this.bindGroupSerial,
      version: 0
    };

    if (initialData) {
      this.writeBuffer(bufferId, initialData);
    }

    return this.buffers[bufferId];
  },

  writeBuffer: function (id, data, offset) {
    var record = this.buffers[String(id || "")];
    var queue = this.getQueue();
    var source = data && data.buffer ? data : null;

    if (!record) {
      throw new Error("Unknown compute buffer: " + id);
    }

    if (!queue || typeof queue.writeBuffer !== "function") {
      throw new Error("GPUQueue.writeBuffer is required for compute buffer writes");
    }

    if (!source) {
      throw new Error("Compute buffer writes require typed array data");
    }

    queue.writeBuffer(
      record.buffer,
      Math.max(0, Math.round(Number(offset) || 0)),
      source.buffer,
      source.byteOffset || 0,
      source.byteLength
    );
    record.version += 1;
    return record;
  },

  createPingPong: function (id, byteLength, usage, initialData, device) {
    var pingPongId = String(id || "").trim();
    var read;
    var write;
    var record;

    if (!pingPongId) {
      throw new Error("Ping-pong id is required");
    }

    read = this.createBuffer(pingPongId + ".read", byteLength, usage, initialData, device);
    write = this.createBuffer(pingPongId + ".write", byteLength, usage, initialData, device);

    record = {
      id: pingPongId,
      buffers: [read, write],
      readIndex: 0,
      writeIndex: 1,
      swaps: 0
    };

    this.pingPongs[pingPongId] = record;
    return record;
  },

  getPingPong: function (id) {
    return this.pingPongs[String(id || "")] || null;
  },

  getReadBuffer: function (id) {
    var record = this.getPingPong(id);
    return record ? record.buffers[record.readIndex] : null;
  },

  getWriteBuffer: function (id) {
    var record = this.getPingPong(id);
    return record ? record.buffers[record.writeIndex] : null;
  },

  swap: function (id) {
    var record = this.getPingPong(id);
    var nextRead;

    if (!record) {
      throw new Error("Unknown ping-pong buffer: " + id);
    }

    nextRead = record.writeIndex;
    record.writeIndex = record.readIndex;
    record.readIndex = nextRead;
    record.swaps += 1;

    return record;
  },

  registerState: function (id, descriptor) {
    var stateId = String(id || "").trim();
    var spec = descriptor || {};
    var byteLength = this.normalizeSize(spec.byteLength || ((Number(spec.width) || 1) * (Number(spec.height) || 1) * (Number(spec.bytesPerCell) || 4)));
    var state;

    if (!stateId) {
      throw new Error("Simulation state id is required");
    }

    state = {
      id: stateId,
      width: Math.max(1, Math.round(Number(spec.width) || 1)),
      height: Math.max(1, Math.round(Number(spec.height) || 1)),
      bytesPerCell: Math.max(4, Math.round(Number(spec.bytesPerCell) || 4)),
      byteLength: byteLength,
      format: spec.format || "float32",
      pingPong: spec.pingPong === false ? null : this.createPingPong(stateId, byteLength, spec.usage || ["storage", "copySrc", "copyDst"], spec.initialData, spec.device),
      meta: spec.meta || {}
    };

    this.states[stateId] = state;
    return state;
  },

  getState: function (id) {
    return this.states[String(id || "")] || null;
  },

  registerPass: function (id, descriptor) {
    var passId = String(id || "").trim();
    var spec = descriptor || {};

    if (!passId) {
      throw new Error("Compute pass id is required");
    }

    if (!spec.pipeline && !spec.pipelineDescriptor) {
      throw new Error("Compute pass requires a pipeline or pipelineDescriptor: " + passId);
    }

    this.passes[passId] = {
      id: passId,
      pipeline: spec.pipeline || null,
      pipelineDescriptor: spec.pipelineDescriptor || null,
      bindGroups: Array.isArray(spec.bindGroups) ? spec.bindGroups.slice() : [],
      workgroups: spec.workgroups || [1, 1, 1],
      beforeDispatch: spec.beforeDispatch || null,
      afterDispatch: spec.afterDispatch || null,
      dispatches: 0
    };

    return this.passes[passId];
  },

  getPassPipeline: function (pass, device) {
    if (pass.pipeline) {
      return pass.pipeline;
    }

    pass.pipeline = PS.render && PS.render.wgslShaders && typeof PS.render.wgslShaders.getComputePipeline === "function"
      ? PS.render.wgslShaders.getComputePipeline(pass.pipelineDescriptor, device)
      : null;

    if (!pass.pipeline) {
      throw new Error("Compute pipeline unavailable: " + pass.id);
    }

    return pass.pipeline;
  },

  dispatch: function (id, commandEncoder, device) {
    var pass = this.passes[String(id || "")];
    var targetDevice = this.getDevice(device);
    var ownsEncoder = !commandEncoder;
    var encoder = commandEncoder;
    var computePass;
    var workgroups;
    var commandBuffer;

    if (!pass) {
      throw new Error("Unknown compute pass: " + id);
    }

    if (!targetDevice || typeof targetDevice.createCommandEncoder !== "function") {
      throw new Error("GPUDevice.createCommandEncoder is required for compute dispatch");
    }

    if (!encoder) {
      encoder = targetDevice.createCommandEncoder({ label: pass.id + ".encoder" });
    }

    computePass = encoder.beginComputePass({ label: pass.id });
    computePass.setPipeline(this.getPassPipeline(pass, targetDevice));

    if (typeof pass.beforeDispatch === "function") {
      pass.beforeDispatch(pass, this);
    }

    for (var i = 0; i < pass.bindGroups.length; i += 1) {
      computePass.setBindGroup(i, pass.bindGroups[i]);
    }

    workgroups = typeof pass.workgroups === "function" ? pass.workgroups(pass, this) : pass.workgroups;
    workgroups = Array.isArray(workgroups) ? workgroups : [1, 1, 1];
    computePass.dispatchWorkgroups(
      Math.max(1, Math.round(Number(workgroups[0]) || 1)),
      Math.max(1, Math.round(Number(workgroups[1]) || 1)),
      Math.max(1, Math.round(Number(workgroups[2]) || 1))
    );
    computePass.end();

    if (typeof pass.afterDispatch === "function") {
      pass.afterDispatch(pass, this);
    }

    pass.dispatches += 1;
    this.dispatchLog.push({
      id: pass.id,
      workgroups: workgroups.slice ? workgroups.slice() : workgroups
    });

    if (this.dispatchLog.length > 100) {
      this.dispatchLog.shift();
    }

    if (ownsEncoder) {
      commandBuffer = encoder.finish();
      if (!this.getQueue() || typeof this.getQueue().submit !== "function") {
        throw new Error("GPUQueue.submit is required for owned compute dispatch");
      }
      this.getQueue().submit([commandBuffer]);
      return commandBuffer;
    }

    return encoder;
  },

  createCachedBindGroup: function (pass, device, groupIndex, descriptor) {
    var cache = pass._bindGroupCache || {};
    var key = String(groupIndex);
    var groupCache = cache[key] || {};
    var entries = descriptor.entries || [];
    var identityKey = "";
    var i;
    var bufferId;
    var record;

    for (i = 0; i < entries.length; i += 1) {
      if (entries[i] && entries[i].resource && entries[i].resource.buffer) {
        bufferId = entries[i].resource.buffer.label || "";
        record = this.buffers[bufferId];
        identityKey += String(entries[i].binding) + ":" + (
          record && record.buffer === entries[i].resource.buffer
            ? record.bindGroupId
            : bufferId
        ) + ";";
      }
    }

    if (groupCache[identityKey]) {
      return groupCache[identityKey];
    }

    var targetDevice = device || this.getDevice();
    if (!targetDevice || typeof targetDevice.createBindGroup !== "function") {
      return null;
    }

    var bindGroup = targetDevice.createBindGroup(descriptor);
    groupCache[identityKey] = bindGroup;
    cache[key] = groupCache;
    pass._bindGroupCache = cache;
    return bindGroup;
  },

  getStats: function () {
    return {
      buffers: Object.keys(this.buffers).length,
      pingPongs: Object.keys(this.pingPongs).length,
      states: Object.keys(this.states).length,
      passes: Object.keys(this.passes).length,
      dispatches: this.dispatchLog.length
    };
  }
};
