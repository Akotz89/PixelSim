function makeTexture(label) {
  return {
    label,
    createView() {
      return { texture: this };
    }
  };
}

function createFakeRenderDevice() {
  const queueWrites = [];
  const submissions = [];
  const fakePasses = [];
  const fakeDevice = {
    buffers: [],
    textures: [],
    pipelines: [],
    bindGroups: [],
    samplers: [],
    modules: [],
    queue: {
      writeBuffer(buffer, offset, data, dataOffset, size) {
        queueWrites.push({ buffer, offset, data, dataOffset, size });
      },
      submit(commandBuffers) {
        submissions.push(commandBuffers);
      }
    },
    createBuffer(descriptor) {
      const buffer = { descriptor };
      this.buffers.push(buffer);
      return buffer;
    },
    createTexture(descriptor) {
      const texture = makeTexture(descriptor.label);
      texture.descriptor = descriptor;
      this.textures.push(texture);
      return texture;
    },
    createSampler(descriptor) {
      const sampler = { descriptor };
      this.samplers.push(sampler);
      return sampler;
    },
    createShaderModule(descriptor) {
      const module = { descriptor };
      this.modules.push(module);
      return module;
    },
    createRenderPipeline(descriptor) {
      const pipeline = {
        descriptor,
        getBindGroupLayout(index) {
          return { index, pipeline: descriptor.label };
        }
      };
      this.pipelines.push(pipeline);
      return pipeline;
    },
    createBindGroup(descriptor) {
      const bindGroup = { descriptor };
      this.bindGroups.push(bindGroup);
      return bindGroup;
    },
    createCommandEncoder(descriptor) {
      return {
        descriptor,
        beginRenderPass(passDescriptor) {
          const pass = {
            descriptor: passDescriptor,
            bindGroups: [],
            draws: [],
            setPipeline(pipeline) {
              this.pipeline = pipeline;
            },
            setBindGroup(index, bindGroup) {
              this.bindGroups[index] = bindGroup;
            },
            draw() {
              this.draws.push(Array.from(arguments));
            },
            end() {
              this.ended = true;
            }
          };
          fakePasses.push(pass);
          return pass;
        },
        finish() {
          return { encoder: this };
        }
      };
    }
  };

  return {
    fakeDevice,
    fakePasses,
    makeTexture,
    queueWrites,
    submissions
  };
}

module.exports = {
  createFakeRenderDevice
};
