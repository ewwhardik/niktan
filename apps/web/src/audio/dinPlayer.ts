import { fft, nextPow2 } from '../cv/dsp';
import { speechGainForSnr } from '../tests/din';

/**
 * Plays digits-in-noise triplets with WebAudio. Speech-shaped noise is synthesised from the
 * long-term average spectrum of the digit recordings themselves (random phase, same magnitude),
 * so speech and masker always match whatever voice recorded the digits.
 */

export const DIGIT_URL = (lang: string, d: number) => `/audio/din/${lang}/${d}.mp3`;
const NOISE_RMS = 0.08;

function rms(buf: Float32Array): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < buf.length; i++) {
    // Ignore near-silence so leading/trailing gaps don't lower the speech RMS.
    if (Math.abs(buf[i]!) > 0.005) {
      s += buf[i]! ** 2;
      n++;
    }
  }
  return n ? Math.sqrt(s / n) : 0;
}

function speechShapedNoise(ctx: AudioContext, digits: AudioBuffer[], seconds = 3): AudioBuffer {
  const frame = 4096;
  const avg = new Float64Array(frame / 2);
  let frames = 0;
  for (const d of digits) {
    const x = d.getChannelData(0);
    for (let start = 0; start + frame <= x.length; start += frame / 2) {
      const re = new Float64Array(frame);
      const im = new Float64Array(frame);
      for (let i = 0; i < frame; i++) re[i] = x[start + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1)));
      fft(re, im);
      for (let k = 0; k < frame / 2; k++) avg[k] = avg[k]! + Math.hypot(re[k]!, im[k]!);
      frames++;
    }
  }
  const n = nextPow2(ctx.sampleRate * seconds);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 1; k < n / 2; k++) {
    const mag = frames ? avg[Math.min(frame / 2 - 1, Math.floor((k * frame) / n))]! / frames : 1;
    const phase = Math.random() * 2 * Math.PI;
    re[k] = mag * Math.cos(phase);
    im[k] = mag * Math.sin(phase);
    re[n - k] = re[k]!;
    im[n - k] = -im[k]!;
  }
  for (let k = 0; k < n; k++) im[k] = -im[k]!;
  fft(re, im);
  const out = ctx.createBuffer(1, n, ctx.sampleRate);
  const ch = out.getChannelData(0);
  let s = 0;
  for (let i = 0; i < n; i++) s += re[i]! ** 2;
  const scale = NOISE_RMS / Math.sqrt(s / n || 1);
  for (let i = 0; i < n; i++) ch[i] = re[i]! * scale;
  return out;
}

export class DinPlayer {
  private ctx: AudioContext;
  private digits: AudioBuffer[] = [];
  private speechRms = 0.1;
  private noise: AudioBuffer | null = null;

  constructor() {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    // iOS: play even with the ring/silent switch on.
    if (nav.audioSession) nav.audioSession.type = 'playback';
    this.ctx = new AudioContext();
  }

  /** Must be called from a tap handler the first time (autoplay policy). */
  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async load(lang = 'hi'): Promise<boolean> {
    try {
      this.digits = await Promise.all(
        Array.from({ length: 10 }, async (_, d) => {
          const res = await fetch(DIGIT_URL(lang, d));
          if (!res.ok) throw new Error('missing');
          return this.ctx.decodeAudioData(await res.arrayBuffer());
        }),
      );
    } catch {
      return false;
    }
    this.speechRms = this.digits.reduce((s, b) => s + rms(b.getChannelData(0)), 0) / this.digits.length || 0.1;
    this.noise = speechShapedNoise(this.ctx, this.digits);
    return true;
  }

  /** Short tone in one ear for the headphone check. */
  tone(side: 'left' | 'right') {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    osc.frequency.value = 1000;
    pan.pan.value = side === 'left' ? -1 : 1;
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
    gain.gain.setValueAtTime(0.2, t + 0.6);
    gain.gain.linearRampToValueAtTime(0, t + 0.65);
    osc.connect(gain).connect(pan).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.7);
  }

  /** Plays a triplet at the given SNR. Resolves when playback ends. */
  playTriplet(triplet: string, snrDb: number): Promise<void> {
    const t0 = this.ctx.currentTime + 0.05;
    const gain = speechGainForSnr(snrDb, this.speechRms, NOISE_RMS);
    let t = t0 + 0.5;
    for (const ch of triplet) {
      const buf = this.digits[Number(ch)]!;
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      src.buffer = buf;
      g.gain.value = Math.min(4, gain);
      src.connect(g).connect(this.ctx.destination);
      src.start(t);
      t += buf.duration + 0.3;
    }
    const end = t + 0.3;
    if (this.noise) {
      const n = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      n.buffer = this.noise;
      n.loop = true;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(1, t0 + 0.1);
      g.gain.setValueAtTime(1, end - 0.1);
      g.gain.linearRampToValueAtTime(0, end);
      n.connect(g).connect(this.ctx.destination);
      n.start(t0);
      n.stop(end + 0.05);
    }
    return new Promise((resolve) => setTimeout(resolve, (end - this.ctx.currentTime) * 1000 + 50));
  }

  close() {
    void this.ctx.close().catch(() => undefined);
  }
}
