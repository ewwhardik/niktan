import { estimateMulti, type MultiSample } from './rppg2';

// Only region means leave the capture loop. Frames and landmarks stay on the main thread.
self.onmessage = ({ data }: MessageEvent<{ samples: MultiSample[]; rejectedTimes: number[]; generation: number }>) => {
  const { heartRate, quality, beats, wave, waveEnd } = estimateMulti(data.samples, { rejectedTimes: data.rejectedTimes });
  self.postMessage({ generation: data.generation, heartRate, quality, beats, wave: Array.from(wave.slice(-150)), waveEnd });
};
