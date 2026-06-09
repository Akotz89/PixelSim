"use strict";
PS.render = PS.render || {};

PS.render.WgslShaderManager = function () {
  this.registry = {};
  this.modules = [];
  this.renderPipelines = {};
  this.computePipelines = {};
  this.errors = [];
  this.manifestPaths = {};
  this.lastManifestStatus = null;
};

PS.render.WgslShaderManager.prototype.getGlobalName = function (nameOrPath) {
  var value = String(nameOrPath || "shader").replace(/\.(wgsl|js)$/g, "");
  return "SHADER_" + value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase() + "_WGSL";
};

PS.render.WgslShaderManager.prototype.register = function (name, source, meta) {
  var shaderName = String(name || "").trim();
  var shaderSource = String(source || "");

  if (!shaderName) {
    throw new Error("WGSL shader name is required");
  }

  if (!shaderSource) {
    throw new Error("WGSL source is required: " + shaderName);
  }

  this.registry[shaderName] = {
    name: shaderName,
    source: shaderSource,
    path: meta && meta.path ? meta.path : "",
    globalName: meta && meta.globalName ? meta.globalName : this.getGlobalName(shaderName),
    loaded: true,
    moduleCount: 0,
    lastError: ""
  };
  this.invalidate(shaderName);
  return this.registry[shaderName];
};

PS.render.WgslShaderManager.prototype.loadFromGlobal = function (name, path) {
  var globalName = this.getGlobalName(path || name);
  var registeredText = path && PS.assets && PS.assets.textData && Object.prototype.hasOwnProperty.call(PS.assets.textData, path)
    ? PS.assets.textData[path]
    : null;
  var source = typeof window !== "undefined" ? window[globalName] : null;

  if (typeof registeredText === "string" && registeredText) {
    return this.register(name, registeredText, {
      path: path || "",
      globalName: globalName
    });
  }

  if (typeof source !== "string" || !source) {
    return null;
  }

  return this.register(name, source, {
    path: path || "",
    globalName: globalName
  });
};

PS.render.WgslShaderManager.prototype.loadFromFile = function (name, shaderPath, loader) {
  var self = this;
  var globalShader = this.loadFromGlobal(name, shaderPath);
  var assetLoader;

  if (name && shaderPath) {
    this.manifestPaths[String(name)] = shaderPath;
  }

  if (globalShader) {
    return Promise.resolve(globalShader);
  }

  assetLoader = loader || (PS.assets && PS.assets.startupLoader) || (PS.assets && PS.assets.AssetLoader ? new PS.assets.AssetLoader() : null);

  if (!assetLoader || typeof assetLoader.loadText !== "function") {
    return Promise.reject(new Error("AssetLoader.loadText is required for WGSL loading"));
  }

  return assetLoader.loadText(shaderPath).then(function (source) {
    return self.register(name, source, {
      path: shaderPath,
      globalName: self.getGlobalName(shaderPath)
    });
  });
};

PS.render.WgslShaderManager.prototype.loadManifest = function (manifest, loader) {
  var self = this;
  var entries = Array.isArray(manifest) ? manifest : [];

  return Promise.all(entries.map(function (entry) {
    if (entry && entry.name && entry.path) {
      self.manifestPaths[String(entry.name)] = entry.path;
    }

    return self.loadFromFile(entry.name, entry.path, loader).then(function (shader) {
      return {
        status: "ready",
        name: entry.name,
        shader: shader
      };
    }).catch(function (error) {
      var message = error && error.message ? error.message : String(error);

      self.recordError(entry && entry.name ? entry.name : "unknown", message);

      return {
        status: "failed",
        name: entry && entry.name ? entry.name : "unknown",
        error: message
      };
    });
  })).then(function (results) {
    var ready = [];
    var failed = [];

    results.forEach(function (result) {
      if (result.status === "ready") {
        ready.push(result.shader);
      } else {
        failed.push({
          name: result.name,
          error: result.error
        });
      }
    });

    self.lastManifestStatus = {
      total: entries.length,
      loaded: ready.length,
      failed: failed.length,
      ready: ready.length,
      failedShaders: failed
    };

    return ready;
  });
};

PS.render.WgslShaderManager.prototype.recordError = function (name, message) {
  this.errors.push({
    name: name,
    message: message,
    time: new Date().toISOString()
  });

  if (this.errors.length > 25) {
    this.errors.shift();
  }

  if (PS.runtime && typeof PS.runtime.recordError === "function") {
    PS.runtime.recordError("wgsl.error", {
      name: name,
      message: message
    });
  }
};

PS.render.WgslShaderManager.prototype.invalidate = function (name) {
  for (var i = 0; i < this.modules.length; i++) {
    if (!name || this.modules[i].name === name) {
      this.modules[i].module = null;
    }
  }
};

PS.render.WgslShaderManager.prototype.findModule = function (device, name) {
  for (var i = 0; i < this.modules.length; i++) {
    if (this.modules[i].device === device && this.modules[i].name === name) {
      return this.modules[i];
    }
  }

  var entry = { device: device, name: name, module: null };
  this.modules.push(entry);
  return entry;
};

PS.render.WgslShaderManager.prototype.getShaderModule = function (device, name) {
  var targetDevice = device || (PS.gpu && PS.gpu.device);
  var shaderName = String(name || "").trim();
  var shader = this.registry[shaderName];
  var record;
  var manifestPath = this.manifestPaths[shaderName];

  if (!targetDevice || typeof targetDevice.createShaderModule !== "function") {
    throw new Error("GPUDevice.createShaderModule is required for WGSL shader modules");
  }

  if ((!shader || !shader.loaded) && manifestPath) {
    shader = this.loadFromGlobal(shaderName, manifestPath);
  }

  if (!shader || !shader.loaded) {
    throw new Error("WGSL source not loaded: " + shaderName);
  }

  record = this.findModule(targetDevice, shaderName);

  if (!record.module) {
    try {
      record.module = targetDevice.createShaderModule({
        label: shaderName,
        code: shader.source
      });
      shader.moduleCount += 1;
      shader.lastError = "";
    } catch (error) {
      shader.lastError = error && error.message ? error.message : String(error);
      this.recordError(shaderName, shader.lastError);
      throw error;
    }
  }

  return record.module;
};

PS.render.WgslShaderManager.prototype.compile = function (name, code, device) {
  if (code !== undefined) {
    this.register(name, code);
  }

  return this.getShaderModule(device || (PS.gpu && PS.gpu.device), name);
};

PS.render.WgslShaderManager.prototype.checkCompilationInfo = function (name, module) {
  var self = this;

  if (!module || typeof module.compilationInfo !== "function") {
    return Promise.resolve([]);
  }

  return module.compilationInfo().then(function (info) {
    var messages = info && Array.isArray(info.messages) ? info.messages : [];
    var errors = messages.filter(function (message) {
      return message && message.type === "error";
    });
    var text;

    if (errors.length === 0) {
      return messages;
    }

    text = errors.map(function (message) {
      return [
        name,
        "line " + (Number(message.lineNum) || 0),
        "col " + (Number(message.linePos) || 0),
        message.message || "WGSL compilation error"
      ].join(": ");
    }).join("\n");

    self.recordError(name, text);

    if (PS.assert) {
      PS.assert(false, text);
    }

    throw new Error(text);
  });
};

PS.render.WgslShaderManager.prototype.getPipelineKey = function (descriptor) {
  var label = descriptor && descriptor.label ? String(descriptor.label) : "";
  var layout = descriptor && descriptor.layout ? String(descriptor.layout) : "auto";
  return label + "|" + layout;
};

PS.render.WgslShaderManager.prototype.getRenderPipeline = function (descriptor, device) {
  var targetDevice = device || (PS.gpu && PS.gpu.device);
  var key = this.getPipelineKey(descriptor);

  if (!targetDevice || typeof targetDevice.createRenderPipeline !== "function") {
    throw new Error("GPUDevice.createRenderPipeline is required");
  }

  if (!this.renderPipelines[key]) {
    this.renderPipelines[key] = targetDevice.createRenderPipeline(descriptor);
  }

  return this.renderPipelines[key];
};

PS.render.WgslShaderManager.prototype.getComputePipeline = function (descriptor, device) {
  var targetDevice = device || (PS.gpu && PS.gpu.device);
  var key = this.getPipelineKey(descriptor);

  if (!targetDevice || typeof targetDevice.createComputePipeline !== "function") {
    throw new Error("GPUDevice.createComputePipeline is required");
  }

  if (!this.computePipelines[key]) {
    this.computePipelines[key] = targetDevice.createComputePipeline(descriptor);
  }

  return this.computePipelines[key];
};

PS.render.WgslShaderManager.prototype.getStats = function () {
  return {
    shaderCount: Object.keys(this.registry).length,
    moduleCount: this.modules.filter(function (entry) {
      return !!entry.module;
    }).length,
    renderPipelineCount: Object.keys(this.renderPipelines).length,
    computePipelineCount: Object.keys(this.computePipelines).length,
    errorCount: this.errors.length
  };
};

PS.render.wgslShaderManager = PS.render.wgslShaderManager || new PS.render.WgslShaderManager();
PS.render.wgslShaders = PS.render.wgslShaderManager;
PS.render.wgslShaderManifest = PS.render.wgslShaderManifest || [];
