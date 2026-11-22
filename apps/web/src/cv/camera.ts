import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraError = 'denied' | 'unavailable' | 'insecure' | 'unknown';

/** Opens the camera only on an explicit start() from a tap (iOS requirement); keeps the screen awake. */
export function useCamera(facingMode: 'user' | 'environment' = 'user') {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'live' | 'error'>('idle');
  const [error, setError] = useState<CameraError | null>(null);
  const [torch, setTorch] = useState<boolean | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void wakeRef.current?.release().catch(() => undefined);
    wakeRef.current = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('insecure');
      setStatus('error');
      return false;
    }
    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);
      }
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorch(caps.torch ? false : null);
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        wakeRef.current = (await nav.wakeLock?.request('screen')) ?? null;
      } catch {
        // Wake lock is optional.
      }
      setError(null);
      setStatus('live');
      return true;
    } catch (e) {
      const name = (e as DOMException).name;
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'unavailable' : 'unknown');
      setStatus('error');
      return false;
    }
  }, [facingMode]);

  const setTorchOn = useCallback(async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch(on);
    } catch {
      setTorch(null);
    }
  }, []);

  useEffect(() => stop, [stop]);
  return { videoRef, status, error, start, stop, torch, setTorchOn };
}

/** Grabs the current video frame into a canvas at most `maxWidth` wide. */
export function grabFrame(video: HTMLVideoElement, maxWidth = 640, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas ?? document.createElement('canvas');
  const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
  c.width = Math.round((video.videoWidth || 640) * scale);
  c.height = Math.round((video.videoHeight || 480) * scale);
  c.getContext('2d', { willReadFrequently: true })!.drawImage(video, 0, 0, c.width, c.height);
  return c;
}
