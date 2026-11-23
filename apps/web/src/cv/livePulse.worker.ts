import { estimateMulti, type MultiSample } from './rppg2';

// Only region means leave the capture loop. Frames and landmarks stay on the main thread.
self.onmessage = ({ data }: MessageEvent<{ samples: MultiSample[]; rejectedTimes: number[]; generation: number }>) => {
  const { heartRate, estimate, quality, beats, wave, waveEnd } = estimateMulti(data.samples, { rejectedTimes: data.rejectedTimes });
  // Below the gate the live read-out still shows the estimate, marked as low confidence.
  const shown = heartRate ?? (quality >= 0.25 ? estimate : null);
  self.postMessage({ generation: data.generation, heartRate: shown, lowConfidence: heartRate === null && shown !== null, quality, beats, wave: Array.from(wave.slice(-150)), waveEnd });
};
