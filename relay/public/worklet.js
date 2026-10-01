const NET_RATE = 16000;
const FRAME = 320;

class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / NET_RATE;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.frame = new Int16Array(FRAME);
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count++;
      if (++this.phase < this.ratio) continue;
      this.phase -= this.ratio;
      const sample = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0;
      this.count = 0;
      this.frame[this.filled++] = sample * 0x7fff;
      if (this.filled === FRAME) {
        const out = this.frame.slice().buffer;
        this.port.postMessage(out, [out]);
        this.filled = 0;
      }
    }
    return true;
  }
}

class Player extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = NET_RATE / sampleRate;
    this.size = NET_RATE * 2;
    this.buffer = new Float32Array(this.size);
    this.write = 0;
    this.read = 0;
    this.playing = false;
    this.port.onmessage = (event) => {
      const samples = new Int16Array(event.data);
      for (let i = 0; i < samples.length; i++) this.buffer[(this.write + i) % this.size] = samples[i] / 0x8000;
      this.write += samples.length;
      if (this.write - this.read > NET_RATE * 0.4) this.read = this.write - NET_RATE * 0.1;
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    const buffered = this.write - this.read;
    if (!this.playing && buffered >= NET_RATE * 0.06) this.playing = true;
    if (!this.playing) return true;
    for (let i = 0; i < output.length; i++) {
      if (this.write - this.read < 2) {
        this.playing = false;
        break;
      }
      const base = Math.floor(this.read);
      const frac = this.read - base;
      const a = this.buffer[base % this.size];
      const b = this.buffer[(base + 1) % this.size];
      output[i] = a + (b - a) * frac;
      this.read += this.step;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(output);
    return true;
  }
}

registerProcessor('capture', Capture);
registerProcessor('player', Player);
