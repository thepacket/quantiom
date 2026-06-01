/**
 * Additive synth driven by the live statevector. Each basis state |i⟩
 * becomes the (i + 1)-th harmonic of a single OscillatorNode whose
 * waveform is rebuilt every frame from the complex amplitudes via
 * `createPeriodicWave(real, imag)`:
 *
 *   y(t) = Σ_i  ( Re[a_i] · cos(2π (i+1) f₀ t) + Im[a_i] · sin(...) )
 *
 * That is, the time-domain audio signal is literally the inverse Fourier
 * series of the statevector's amplitude vector. A Hadamard cascade on
 * |0⟩ adds the second-harmonic partial; an oracle that flips a single
 * basis state shifts a single harmonic in or out; entangling gates
 * spread amplitude across many harmonics simultaneously.
 *
 * Using one oscillator with a periodic-wave update gives clean, glitch-
 * free timbre changes for the typical sub-Hz animation rates, and scales
 * to 2^n harmonics for n up to the simulator's MAX_QUBITS = 8.
 */

export class SynthEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private osc: OscillatorNode;
  private currentRe = new Float32Array(2);
  private currentIm = new Float32Array(2);

  constructor(baseFreq: number) {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    this.osc = this.ctx.createOscillator();
    this.osc.frequency.value = baseFreq;
    this.osc.connect(this.master);
    // Start with a silent waveform.
    this.applyWave();
    this.osc.start();
  }

  /** Push the latest amplitudes. amps[i] = (re, im) of basis state |i⟩. */
  setAmplitudes(amps: Array<readonly [number, number]>): void {
    const n = amps.length;
    const realParts = new Float32Array(n + 1);
    const imagParts = new Float32Array(n + 1);
    for (let i = 0; i < n; i++) {
      realParts[i + 1] = amps[i][0];
      imagParts[i + 1] = amps[i][1];
    }
    this.currentRe = realParts;
    this.currentIm = imagParts;
    this.applyWave();
  }

  private applyWave(): void {
    if (this.currentRe.length < 2) {
      this.currentRe = new Float32Array(2);
      this.currentIm = new Float32Array(2);
    }
    const wave = this.ctx.createPeriodicWave(this.currentRe, this.currentIm, {
      disableNormalization: false,
    });
    this.osc.setPeriodicWave(wave);
  }

  setBaseFrequency(freq: number): void {
    const now = this.ctx.currentTime;
    this.osc.frequency.cancelScheduledValues(now);
    this.osc.frequency.linearRampToValueAtTime(freq, now + 0.05);
  }

  setMasterGain(volume: number): void {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.linearRampToValueAtTime(volume, now + 0.05);
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  destroy(): void {
    try {
      this.osc.stop();
    } catch {
      /* already stopped */
    }
    void this.ctx.close();
  }
}
