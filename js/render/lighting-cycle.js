"use strict";
PS.render = PS.render || {};

PS.render.lightingCycle = PS.render.lightingCycle || (function () {
  var DAY_TICKS = 24000;
  var TWO_PI = Math.PI * 2;
  var INDOOR_NIGHT = [0.7, 0.5, 0.3];
  var ERA_PRESETS = {
    volcanic: { ambientColor: [1.0, 0.5, 0.2], ambient: 0.42, tilt: 0.22 },
    temperate: { ambientColor: [1.0, 1.0, 1.0], ambient: 0.50, tilt: 0.54 },
    ice: { ambientColor: [0.6, 0.7, 1.0], ambient: 0.30, tilt: 0.36 }
  };
  var lastStateKey = "";
  var lastState = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function readTimeOfDay(options) {
    var spec = options || {};
    var currentWorld = typeof world !== "undefined" ? world : null;
    var value = spec.timeOfDay;
    var tick;
    var fraction;

    if (value === undefined && spec.dayTime !== undefined) {
      value = spec.dayTime;
    }

    if (value === undefined && currentWorld) {
      value = currentWorld.timeOfDay !== undefined ? currentWorld.timeOfDay : currentWorld.dayTime;
    }

    if (value !== undefined && Number.isFinite(Number(value))) {
      value = Number(value);
      return ((value % 1) + 1) % 1;
    }

    tick = currentWorld && Number.isFinite(Number(currentWorld.tick)) ? Number(currentWorld.tick) : 0;
    fraction = ((tick % DAY_TICKS) + DAY_TICKS) % DAY_TICKS / DAY_TICKS;
    return Math.round(fraction * 720) / 720;
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function mixColor(a, b, t) {
    return [
      mix(a[0], b[0], t),
      mix(a[1], b[1], t),
      mix(a[2], b[2], t)
    ];
  }

  function partOfCircular(value) {
    var amount = ((Number(value) || 0) % 1 + 1) % 1;
    return amount < 0.5 ? amount * 2 : (1 - amount) * 2;
  }

  function getEraPreset(name) {
    return ERA_PRESETS[String(name || "temperate").toLowerCase()] || ERA_PRESETS.temperate;
  }

  function getEraState(options) {
    var spec = options || {};
    var from = getEraPreset(spec.fromEra || spec.era);
    var to = getEraPreset(spec.toEra || spec.era);
    var transition = partOfCircular(spec.transition);
    var color = mixColor(from.ambientColor, to.ambientColor, transition);
    var tilt = mix(from.tilt, to.tilt, transition);

    return {
      era: String(spec.era || spec.toEra || spec.fromEra || "temperate"),
      transition: transition,
      ambient: mix(from.ambient, to.ambient, transition),
      ambientColor: color,
      tilt: tilt,
      sunDirection: getSunDirection(clamp01(0.25 + transition * 0.5)),
      shadowLength: clamp(3.5 - 3 * tilt, 0.5, 3.5)
    };
  }

  function AmbientLight(options) {
    var spec = options || {};
    var direction = spec.direction || { x: 0, y: 1, z: 0 };

    this.direction = {
      x: Number(direction.x) || 0,
      y: Number(direction.y) || 0,
      z: Number(direction.z) || 0
    };
    this.tilt = clamp01(spec.tilt);
    this.rgb = Array.isArray(spec.rgb) && spec.rgb.length >= 3
      ? [clamp01(spec.rgb[0]), clamp01(spec.rgb[1]), clamp01(spec.rgb[2])]
      : [1, 1, 1];
  }

  function getSunTilt(timeOfDay) {
    return clamp01(Math.sin(timeOfDay * Math.PI));
  }

  function getSunDirection(timeOfDay) {
    var angle = ((360 + 90) - timeOfDay * 360) * Math.PI / 180;
    var tilt = getSunTilt(timeOfDay);
    var y = Math.max(0.12, tilt * 1.8);
    var x = Math.cos(angle);
    var z = Math.sin(angle);
    var length = Math.sqrt(x * x + y * y + z * z) || 1;

    return {
      x: x / length,
      y: y / length,
      z: z / length
    };
  }

  function getAmbientColor(timeOfDay) {
    if (timeOfDay < 0.18) {
      return mixColor([1, 0.84, 0.68], [1, 0.96, 0.88], timeOfDay / 0.18);
    }

    if (timeOfDay < 0.50) {
      return mixColor([1, 0.96, 0.88], [1, 1, 0.96], (timeOfDay - 0.18) / 0.32);
    }

    if (timeOfDay < 0.72) {
      return mixColor([1, 1, 0.96], [1, 0.72, 0.56], (timeOfDay - 0.50) / 0.22);
    }

    return mixColor([0.72, 0.8, 1], [0.58, 0.66, 1], Math.min(1, (timeOfDay - 0.72) / 0.28));
  }

  function getAmbientIntensity(timeOfDay, tilt) {
    var night = timeOfDay >= 0.72 || timeOfDay < 0.04;

    if (night) {
      return 0.16;
    }

    return clamp(0.22 + tilt * 0.34, 0.18, 0.58);
  }

  function getState(options) {
    var spec = options || {};
    var timeOfDay = readTimeOfDay(spec);
    var key = [
      timeOfDay,
      spec.sunDirection ? 1 : 0,
      spec.ambient,
      Array.isArray(spec.ambientColor) ? spec.ambientColor.join(",") : "",
      spec.directionalStrength,
      spec.wrapStrength,
      spec.heightTintStrength
    ].join("|");

    if (key === lastStateKey && lastState) {
      return lastState;
    }

    var tilt = getSunTilt(timeOfDay);
    var nightFactor = timeOfDay >= 0.72 || timeOfDay < 0.04 ? 1 : clamp01((0.18 - tilt) / 0.18);
    var ambient = spec.ambient !== undefined ? clamp01(spec.ambient) : getAmbientIntensity(timeOfDay, tilt);
    var ambientColor = Array.isArray(spec.ambientColor) && spec.ambientColor.length >= 3
      ? [clamp01(spec.ambientColor[0]), clamp01(spec.ambientColor[1]), clamp01(spec.ambientColor[2])]
      : getAmbientColor(timeOfDay);
    var shadowLength = clamp(3.5 - 3 * tilt, 0.5, 3.5);

    lastStateKey = key;
    lastState = {
      timeOfDay: timeOfDay,
      tilt: tilt,
      sunDirection: spec.sunDirection ? null : getSunDirection(timeOfDay),
      ambient: ambient,
      ambientColor: ambientColor,
      directionalStrength: spec.directionalStrength !== undefined ? Math.max(0, Number(spec.directionalStrength) || 0) : clamp(0.22 + tilt * 0.42, 0.18, 0.66),
      wrapStrength: spec.wrapStrength !== undefined ? Math.max(0, Number(spec.wrapStrength) || 0) : clamp(0.10 + tilt * 0.10, 0.08, 0.22),
      heightTintStrength: spec.heightTintStrength !== undefined ? Math.max(0, Number(spec.heightTintStrength) || 0) : clamp(0.05 + (1 - tilt) * 0.06, 0.05, 0.12),
      shadowLength: shadowLength,
      shadowStepScale: shadowLength / 1.4,
      shadowAlphaScale: clamp(0.58 + (1 - tilt) * 0.48, 0.58, 1.06),
      nightFactor: nightFactor,
      indoorAmbient: [
        INDOOR_NIGHT[0] * (0.34 + nightFactor * 0.66),
        INDOOR_NIGHT[1] * (0.34 + nightFactor * 0.66),
        INDOOR_NIGHT[2] * (0.34 + nightFactor * 0.66)
      ]
    };
    return lastState;
  }

  return {
    DAY_TICKS: DAY_TICKS,
    ERA_PRESETS: ERA_PRESETS,
    AmbientLight: AmbientLight,
    partOfCircular: partOfCircular,
    getEraState: getEraState,
    getEraAmbientLight: function (options) {
      var state = getEraState(options);
      return new AmbientLight({
        direction: state.sunDirection,
        tilt: state.tilt,
        rgb: state.ambientColor
      });
    },
    getState: getState,
    getSunDirection: function (options) {
      return getState(options).sunDirection;
    },
    getIndoorAmbient: function (options) {
      return getState(options).indoorAmbient;
    }
  };
}());
