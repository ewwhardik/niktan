import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraError = 'denied' | 'unavailable' | 'insecure' | 'interrupted' | 'model' | 'unknown';

/** Own the stream, wake lock and model work for one user-initiated camera session. */
export function useCamera(facingMode: 'user' | 'environment' = 'user', { idealWidth = 640, requestTorch = false } = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const session = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'live' | 'error'>('idle');
  const [error, setError] = useState<CameraError | null>(null);
  const [torch, setTorch] = useState(false);

  const stop = useCallback(() => {
    session.current?.abort();
    session.current = null;
    setTorch(false);
    setError(null);
    setStatus('idle');
  }, []);

  const fail = useCallback((reason: CameraError) => {
    stop();
    setError(reason);
    setStatus('error');
  }, [stop]);

  const start = useCallback(async (): Promise<AbortSignal | null> => {
    stop();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      fail(window.isSecureContext ? 'unavailable' : 'insecure');
      return null;
    }
    const controller = new AbortController();
    session.current = controller;
    const { signal } = controller;
    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facingMode }, width: { ideal: idealWidth }, height: { ideal: idealWidth * 0.75 }, frameRate: { ideal: 30, max: 30 } },
      });
      const video = videoRef.current;
      const release = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (video && video.srcObject === stream) video.srcObject = null;
      };
      if (signal.aborted) {
        release();
        return null;
      }
      signal.addEventListener('abort', release, { once: true });
      const track = stream.getVideoTracks()[0];
      if (!video || !track || track.readyState === 'ended') throw new Error('No live video track');
      track.addEventListener('ended', () => fail('interrupted'), { signal });
      // Phones and laptops mute a track for a moment during exposure changes or OS hiccups; only a
      // track that stays muted is treated as lost.
      let muteTimer: number | undefined;
      track.addEventListener('mute', () => {
        clearTimeout(muteTimer);
        muteTimer = window.setTimeout(() => { if (track.muted && !signal.aborted) fail('interrupted'); }, 3000);
      }, { signal });
      track.addEventListener('unmute', () => clearTimeout(muteTimer), { signal });
      signal.addEventListener('abort', () => clearTimeout(muteTimer), { once: true });
      video.srcObject = stream;
      await video.play();
      if (signal.aborted) return null;
      const capabilities = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      if (requestTorch && capabilities?.torch) {
        try {
          await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
          if (signal.aborted) return null;
          setTorch((track.getSettings() as MediaTrackSettings & { torch?: boolean }).torch === true);
        } catch {
          // Eye capture can proceed in ambient light. The pupil check needs a confirmed torch.
        }
      }
      if (signal.aborted) return null;
      setStatus('live');
      void navigator.wakeLock?.request('screen').then((lock) => {
        const releaseLock = () => { void lock.release().catch(() => undefined); };
        if (signal.aborted) releaseLock();
        else signal.addEventListener('abort', releaseLock, { once: true });
      }).catch(() => undefined);
      return signal;
    } catch (e) {
      if (!signal.aborted) {
        const name = (e as DOMException).name;
        fail(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'unavailable' : 'unknown');
      }
      return null;
    }
  }, [fail, facingMode, idealWidth, requestTorch, stop]);

  useEffect(() => {
    // A permission sheet or notification can hide the page for an instant; leaving the app cannot.
    let hiddenTimer: number | undefined;
    const interrupt = () => {
      clearTimeout(hiddenTimer);
      if (session.current && document.visibilityState === 'hidden') {
        hiddenTimer = window.setTimeout(() => {
          if (session.current && document.visibilityState === 'hidden') fail('interrupted');
        }, 1200);
      }
    };
    document.addEventListener('visibilitychange', interrupt);
    return () => {
      document.removeEventListener('visibilitychange', interrupt);
      clearTimeout(hiddenTimer);
      session.current?.abort();
      session.current = null;
    };
  }, [fail]);
  return { videoRef, session, status, error, start, stop, fail, torch };
}

/** Read only a decoded video frame. Reuse canvas allocation across frames of the same size. */
export function grabFrame(video: HTMLVideoElement, maxWidth = 640, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error('No decoded video frame');
  const c = canvas ?? document.createElement('canvas');
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const w = Math.round(video.videoWidth * scale);
  const h = Math.round(video.videoHeight * scale);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  c.getContext('2d', { willReadFrequently: true })!.drawImage(video, 0, 0, w, h);
  return c;
}
