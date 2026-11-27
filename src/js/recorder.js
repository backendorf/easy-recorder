// Gravação via MediaRecorder, com pausa e cronômetro que ignora o tempo pausado.
// Sempre MP4 (H.264 + AAC). Perfil High nível 5.1 cobre até 4K; os seguintes são reservas.
const TYPES = [
  'video/mp4;codecs=avc1.640033,mp4a.40.2',
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.4d0028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4',
];

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

export const supportsMp4 = () => !!pickMimeType();

export class Recorder {
  constructor(stream, { width = 1920, height = 1080 } = {}) {
    this.stream = stream;
    this.mimeType = pickMimeType();
    this.mr = new MediaRecorder(stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: bitrateFor(width, height),
      audioBitsPerSecond: 192_000,
    });
    this.chunks = [];
    this.mr.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.acc = 0;
    this.since = null;
  }

  get container() {
    return 'video/mp4';
  }

  get extension() {
    return 'mp4';
  }

  start() {
    this.mr.start(1000);
    this.since = performance.now();
  }

  pause() {
    if (this.mr.state !== 'recording') return;
    this.mr.pause();
    this.acc += performance.now() - this.since;
    this.since = null;
  }

  resume() {
    if (this.mr.state !== 'paused') return;
    this.mr.resume();
    this.since = performance.now();
  }

  get elapsed() {
    return this.acc + (this.since ? performance.now() - this.since : 0);
  }

  stop() {
    if (this.since) {
      this.acc += performance.now() - this.since;
      this.since = null;
    }
    return new Promise((resolve) => {
      const done = () => resolve(new Blob(this.chunks, { type: this.container }));
      if (this.mr.state === 'inactive') return done();
      this.mr.onstop = done;
      this.mr.stop();
    });
  }
}

// ~0,2 bit por pixel por quadro a 30 fps, entre 8 e 50 Mbps.
export function bitrateFor(w, h, fps = 30) {
  return Math.round(Math.min(50e6, Math.max(8e6, w * h * fps * 0.2)));
}

const pad = (n) => String(n).padStart(2, '0');

export function fileName(ext = 'mp4', d = new Date()) {
  return `easy-recorder-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
