import { estimateMulti, type MultiSample } from './rppg2';

// Only region means leave the capture loop. Frames and landmarks stay on the main thread.
self.onmessage = ({ data }: MessageEvent<{ samples: MultiSample[]; generation: number }>) => {
  const { heartRate, pulse, quality } = estimateMulti(data.samples);
  self.postMessage({ generation: data.generation, heartRate, quality, wave: Array.from(pulse.slice(-150)) });
};
