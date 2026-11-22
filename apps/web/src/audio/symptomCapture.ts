/** One push-to-talk gesture. Releasing while permission is pending discards any late stream. */
export class SymptomCapture {
  private released = false;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private audio?: AudioContext;
  private raf = 0;
  private chunks: Blob[] = [];

  async start(onLevel: (value: number) => void): Promise<boolean> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (this.released) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    this.stream = stream;
    try {
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) this.chunks.push(event.data);
      };
      recorder.start();
    } catch (error) {
      this.cancel();
      throw error;
    }

    // Capture also works on devices that cannot create an audio-level meter.
    try {
      const ctx = new AudioContext();
      this.audio = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) sum += ((value - 128) / 128) ** 2;
        onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* The level meter is optional. */ }
    return true;
  }

  private releaseDevices() {
    this.released = true;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.audio && this.audio.state !== 'closed') void this.audio.close().catch(() => undefined);
    this.audio = undefined;
  }

  cancel() {
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.releaseDevices();
  }

  async finish(): Promise<Blob | null> {
    this.released = true;
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') {
      this.releaseDevices();
      return null;
    }
    const done = new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true }));
    try {
      recorder.stop();
    } finally {
      this.releaseDevices();
    }
    await done;
    return new Blob(this.chunks, { type: recorder.mimeType });
  }
}
