// Acesso a tela, câmera, microfone e mixagem de áudio.
const md = navigator.mediaDevices;

export const support = {
  secure: window.isSecureContext,
  display: !!md?.getDisplayMedia,
  user: !!md?.getUserMedia,
  recorder: typeof MediaRecorder !== 'undefined',
};

export class MediaAccessError extends Error {
  constructor(kind, cause) {
    super(kind);
    this.kind = kind; // 'cancelled' | 'denied' | 'notfound' | 'unknown'
    this.cause = cause;
  }
}

function classify(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return 'denied';
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return 'notfound';
  return 'unknown';
}

export async function getScreen({ audio }) {
  try {
    return await md.getDisplayMedia({
      video: { frameRate: 30, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
      ...(audio ? { systemAudio: 'include' } : {}),
    });
  } catch (e) {
    // Fechar o seletor também chega como NotAllowedError.
    throw new MediaAccessError(e?.name === 'NotAllowedError' ? 'cancelled' : classify(e), e);
  }
}

export async function getCamera(deviceId) {
  try {
    return await md.getUserMedia({
      video: {
        ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
  } catch (e) {
    throw new MediaAccessError(classify(e), e);
  }
}

export async function getMic(deviceId) {
  try {
    return await md.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        // Sem ganho automático: ele achata o volume e esconde os picos de voz.
        autoGainControl: false,
      },
      video: false,
    });
  } catch (e) {
    throw new MediaAccessError(classify(e), e);
  }
}

// Câmera e microfone num único pedido: o navegador pergunta uma vez só.
export async function getCamAndMic({ camId, micId, cam = true, mic = true }) {
  try {
    return await md.getUserMedia({
      video: cam
        ? { ...(camId ? { deviceId: { ideal: camId } } : {}), width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
        : false,
      audio: mic ? { ...(micId ? { deviceId: { ideal: micId } } : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: false } : false,
    });
  } catch (e) {
    throw new MediaAccessError(classify(e), e);
  }
}

export async function listDevices() {
  if (!md?.enumerateDevices) return { cams: [], mics: [] };
  const all = await md.enumerateDevices();
  const pick = (kind, name) =>
    all
      .filter((d) => d.kind === kind && d.deviceId)
      .map((d, i) => ({ id: d.deviceId, label: d.label || `${name} ${i + 1}` }));
  return { cams: pick('videoinput', 'Câmera'), mics: pick('audioinput', 'Microfone') };
}

export async function permissionState(name) {
  try {
    return (await navigator.permissions.query({ name })).state;
  } catch {
    return 'prompt';
  }
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

let audioCtx = null;
export function audioContext() {
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

// Junta várias fontes de áudio numa única trilha (MediaRecorder lida mal com várias).
// Junta várias fontes de áudio numa única trilha (MediaRecorder lida mal com várias).
// A trilha existe mesmo sem fontes, para dar para somar o áudio de uma tela compartilhada no meio da gravação.
export function mixAudio(streams) {
  const ctx = audioContext();
  const dest = ctx.createMediaStreamDestination();
  const nodes = [];
  const add = (s) => {
    if (!s?.getAudioTracks().length) return;
    const src = ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
    src.connect(dest);
    nodes.push(src);
  };
  streams.forEach(add);
  return {
    track: dest.stream.getAudioTracks()[0],
    add,
    close: () => nodes.forEach((n) => n.disconnect()),
  };
}

// Medidor de nível (RF04c): devolve um valor 0..1 a cada leitura.
export function createLevelMeter(stream) {
  const ctx = audioContext();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  return {
    read() {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      // dBFS de -60..0 vira 0..1
      const db = 20 * Math.log10(rms || 1e-8);
      return Math.min(1, Math.max(0, (db + 60) / 60));
    },
    close: () => src.disconnect(),
  };
}
