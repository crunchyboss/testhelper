// Collects mono input frames and posts them to the main thread in blocks of 2048 samples.
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(2048);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this.block[this.filled++] = channel[i];
        if (this.filled === this.block.length) {
          this.port.postMessage(this.block);
          this.block = new Float32Array(2048);
          this.filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
