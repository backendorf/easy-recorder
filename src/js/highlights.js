// Vídeo de highlights escolhidos só pela intensidade da voz (microfone).
// 1) Durante a gravação, o app anota o nível do microfone ~10 vezes por segundo.
// 2) No fim, acha os picos bem acima do normal e monta trechos em volta deles.
// 3) Toca o vídeo final escondido, só nesses trechos, e grava um MP4 novo. Tudo local.
import { audioContext } from './media.js';
import { Recorder } from './recorder.js';

// Timer em Worker: segue batendo mesmo com a aba em segundo plano.
export function ticker(fps, fn) {
  const code = `setInterval(() => postMessage(0), ${1000 / fps});`;
  try {
    const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    w.onmessage = fn;
    return () => w.terminate();
  } catch {
    const id = setInterval(fn, 1000 / fps);
    return () => clearInterval(id);
  }
}

/**
 * samples: [{ t: ms no vídeo, v: nível 0..1 }]
 * Retorna trechos [{ start, end }] em ms, em ordem cronológica.
 *
 * A fala alterna voz e silêncio entre palavras, então a referência ("seu tom normal")
 * é calculada só sobre os momentos com voz. Picos são momentos bem acima desse normal;
 * a sensibilidade controla o quanto acima. Se nada passar do limiar mas houver voz,
 * usa os momentos mais altos da gravação, para não voltar vazio.
 */
const SENS = { low: 1.6, medium: 1.0, high: 0.6 };

export function findHighlights(
  samples,
  { pre = 3000, post = 4000, maxTotal = 30000, minGap = 1000, sensitivity = 'medium' } = {},
) {
  if (samples.length < 20) return [];

  // Suavização curta (~0,5 s) para um estalo isolado não contar como pico.
  const W = 2;
  const sm = samples.map((s, i) => {
    let a = 0;
    let n = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(samples.length - 1, i + W); j++) {
      a += samples[j].v;
      n++;
    }
    return { t: s.t, v: a / n };
  });

  const quant = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  const all = sm.map((s) => s.v).sort((a, b) => a - b);
  const floor = quant(all, 0.2); // ruído de fundo / silêncio
  const voiced = all.filter((v) => v > floor + 0.08);
  if (voiced.length < 10) return []; // praticamente sem voz

  const normal = quant(voiced, 0.5);
  const spread = Math.max(0.03, quant(voiced, 0.8) - quant(voiced, 0.2));
  const thr = normal + Math.max(0.04, (SENS[sensitivity] ?? 1) * spread);

  // Regiões acima do limiar, guardando o ponto mais alto de cada uma.
  let peaks = [];
  let cur = null;
  for (const s of sm) {
    if (s.v >= thr) {
      if (!cur) cur = { peakT: s.t, peakV: s.v };
      if (s.v > cur.peakV) Object.assign(cur, { peakT: s.t, peakV: s.v });
    } else if (cur) {
      peaks.push(cur);
      cur = null;
    }
  }
  if (cur) peaks.push(cur);

  // Reserva: nenhum pico claro, mas teve voz → os 3 momentos mais altos, bem separados.
  if (!peaks.length) {
    const byLoud = [...sm].sort((a, b) => b.v - a.v);
    for (const s of byLoud) {
      if (s.v <= normal) break;
      if (peaks.every((p) => Math.abs(p.peakT - s.t) > pre + post)) peaks.push({ peakT: s.t, peakV: s.v });
      if (peaks.length === 3) break;
    }
  }

  const duration = samples[samples.length - 1].t;
  const clips = peaks
    .map((p) => ({ start: Math.max(0, p.peakT - pre), end: Math.min(duration, p.peakT + post), score: p.peakV - normal }))
    .sort((a, b) => a.start - b.start);

  // Junta trechos que se encostam.
  const merged = [];
  for (const c of clips) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end + minGap) {
      last.end = Math.max(last.end, c.end);
      last.score = Math.max(last.score, c.score);
    } else merged.push({ ...c });
  }

  // Fica com os mais fortes até o limite de duração, depois volta à ordem do vídeo.
  const picked = [];
  let total = 0;
  for (const c of [...merged].sort((a, b) => b.score - a.score)) {
    const d = c.end - c.start;
    if (total + d > maxTotal && picked.length) continue;
    picked.push(c);
    total += d;
  }
  return picked.sort((a, b) => a.start - b.start).map(({ start, end }) => ({ start, end }));
}

const once = (el, ev) => new Promise((resolve) => el.addEventListener(ev, resolve, { once: true }));

/** Monta o MP4 de highlights a partir do vídeo final. onProgress recebe 0..1. */
export async function renderHighlights(blob, clips, onProgress = () => {}) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  Object.assign(v, { src: url, playsInline: true, preload: 'auto' });
  document.getElementById('hidden-sources').append(v);
  await once(v, 'loadedmetadata');

  // MP4 gravado no navegador às vezes não informa a duração: força o cálculo.
  if (!Number.isFinite(v.duration)) {
    v.currentTime = 1e9;
    await once(v, 'seeked');
  }

  const W = v.videoWidth;
  const H = v.videoHeight;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');

  // Áudio do vídeo vai para a gravação, não para as caixas de som.
  const actx = audioContext();
  const src = actx.createMediaElementSource(v);
  const dest = actx.createMediaStreamDestination();
  src.connect(dest);

  const out = canvas.captureStream(30);
  out.addTrack(dest.stream.getAudioTracks()[0]);
  const rec = new Recorder(out, { width: W, height: H });

  const FADE = 250; // ms de fade em cada ponta do trecho
  let clip = null;
  let waiter = null;
  const draw = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (clip) {
      const t = v.currentTime * 1000;
      ctx.globalAlpha = Math.max(0, Math.min(1, (t - clip.start) / FADE, (clip.end - t) / FADE));
      ctx.drawImage(v, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    waiter?.();
  };
  const stopTick = ticker(30, draw);

  const total = clips.reduce((a, c) => a + (c.end - c.start), 0);
  let done = 0;
  try {
    for (const [i, c] of clips.entries()) {
      v.currentTime = c.start / 1000;
      await once(v, 'seeked');
      clip = c;
      draw();
      if (i === 0) rec.start();
      else rec.resume();
      await v.play();
      await new Promise((resolve) => {
        waiter = () => {
          const t = v.currentTime * 1000;
          onProgress(Math.min(1, (done + Math.max(0, t - c.start)) / total));
          if (t >= c.end || v.ended) {
            waiter = null;
            resolve();
          }
        };
      });
      v.pause();
      rec.pause();
      done += c.end - c.start;
    }
    return await rec.stop();
  } finally {
    stopTick();
    src.disconnect();
    out.getTracks().forEach((t) => t.stop());
    v.remove();
    URL.revokeObjectURL(url);
  }
}

/** Junta vários vídeos (urls) em um MP4, na ordem dada. Toca cada um escondido e grava. onProgress 0..1. */
export async function mergeVideos(urls, onProgress = () => {}) {
  const box = document.getElementById('hidden-sources');
  const vids = [];
  for (const url of urls) {
    const v = Object.assign(document.createElement('video'), { src: url, playsInline: true, preload: 'auto' });
    box.append(v);
    await once(v, 'loadedmetadata');
    if (!Number.isFinite(v.duration)) {
      v.currentTime = 1e9;
      await once(v, 'seeked');
      v.currentTime = 0;
      await once(v, 'seeked');
    }
    vids.push(v);
  }
  // O vídeo final tem o tamanho do primeiro; os outros entram centralizados, sem cortar.
  const W = vids[0].videoWidth;
  const H = vids[0].videoHeight;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  const actx = audioContext();
  const dest = actx.createMediaStreamDestination();
  const srcs = vids.map((v) => actx.createMediaElementSource(v));
  const out = canvas.captureStream(30);
  out.addTrack(dest.stream.getAudioTracks()[0]);
  const rec = new Recorder(out, { width: W, height: H });

  const total = vids.reduce((a, v) => a + (Number.isFinite(v.duration) ? v.duration : 0), 0) || 1;
  let cur = null;
  let done = 0;
  const draw = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (cur) {
      const k = Math.min(W / cur.videoWidth, H / cur.videoHeight);
      const w = cur.videoWidth * k;
      const h = cur.videoHeight * k;
      ctx.drawImage(cur, (W - w) / 2, (H - h) / 2, w, h);
      onProgress(Math.min(1, (done + cur.currentTime) / total));
    }
  };
  const stopTick = ticker(30, draw);
  try {
    for (const [i, v] of vids.entries()) {
      srcs[i].connect(dest);
      cur = v;
      draw();
      if (i === 0) rec.start();
      else rec.resume();
      const ended = once(v, 'ended');
      await v.play();
      await ended;
      rec.pause();
      srcs[i].disconnect();
      done += Number.isFinite(v.duration) ? v.duration : 0;
    }
    return await rec.stop();
  } finally {
    stopTick();
    out.getTracks().forEach((t) => t.stop());
    vids.forEach((v) => v.remove());
  }
}
