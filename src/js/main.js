// Liga estado, mídia, compositor e gravador à interface.
import { state, update, setStatus, subscribe } from './state.js';
import * as media from './media.js';
import { LAYOUTS, computeVerticalLayout } from './layouts.js';
import { Compositor } from './compositor.js';
import { Background } from './background.js';
import { Recorder, fileName, formatTime, supportsMp4 } from './recorder.js';
import * as ui from './ui.js';
import { openPip, updatePip, closePip, pipWindow } from './pip.js';
import { findHighlights, renderHighlights, ticker, mergeVideos } from './highlights.js';
import { loadSettings, saveSettings, saveBackgroundFile, loadBackgroundFile } from './settings.js';

const { $ } = ui;
const canvas = $('preview');
const vScreen = $('v-screen');
const vCam = $('v-cam');
const background = new Background();

const streams = { screen: null, cam: null, mic: null };
let meter = null;
let recorder = null;
let recorderV = null; // versão vertical para celular
let levelSamples = []; // nível do microfone ao longo da gravação (highlights)
let stopSampler = null;
let lastBlob = null;
let lastBlobV = null; // versão celular, se gravada
let compositorV = null;
let audioMix = null;
let timerId = null;
let cancelCountdown = null;
let downloaded = false;

const sceneFor = () => ({
  // "Trocar sozinho": nesta aba grava só a câmera; fora dela, o layout escolhido.
  layout: state.autoCam ? 'cam' : state.layout,
  corner: state.bubbleCorner,
  size: state.bubbleSize,
  shape: state.camShape,
  border: state.camBorder,
  splitRatio: state.splitRatio,
  camZoom: state.camZoom,
  zoomAmount: state.zoomAmount,
  zoomSpeed: state.zoomSpeed,
  screenVideo: vScreen,
  camVideo: vCam,
  background,
});
const compositor = new Compositor(canvas, sceneFor);

// Canvas 9:16 (1080×1920) desenhado em paralelo só durante a gravação.
const canvasV = Object.assign(document.createElement('canvas'), { width: 1080, height: 1920 });

// ---------- Resolução (RNF04: sempre a máxima) ----------
const MAX_W = 3840;
const MAX_H = 2160;

function fitCanvasToSource() {
  if (recorder) return; // não muda de tamanho no meio da gravação
  const v = LAYOUTS[state.layout].screen ? vScreen : vCam;
  let w = v.videoWidth || 1920;
  let h = v.videoHeight || 1080;
  const scale = Math.min(1, MAX_W / w, MAX_H / h);
  w = Math.round((w * scale) / 2) * 2;
  h = Math.round((h * scale) / 2) * 2;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  // O quadro do preview segue a proporção do vídeo, sem faixas nas laterais.
  canvas.parentElement.style.aspectRatio = `${w} / ${h}`;
}
for (const v of [vScreen, vCam]) {
  v.addEventListener('loadedmetadata', fitCanvasToSource);
  v.addEventListener('resize', fitCanvasToSource);
}

// ---------- Fontes ----------
function attach(video, stream) {
  video.srcObject = stream;
  if (stream) video.play().catch(() => {});
}

async function shareScreen() {
  let s;
  try {
    s = await media.getScreen({ audio: state.tabAudio });
  } catch (e) {
    if (e.kind !== 'cancelled') ui.toast('Não foi possível compartilhar a tela.');
    return false;
  }
  media.stopStream(streams.screen);
  streams.screen = s;
  attach(vScreen, s);
  s.getVideoTracks()[0].addEventListener('ended', () => onScreenEnded(s));
  update({ hasScreen: true });
  fitCanvasToSource();
  if (recorder) {
    audioMix?.add(s); // áudio da aba, se houver, entra na mesma trilha
    if (screenReturnLayout) selectLayout(screenReturnLayout); // volta ao layout de antes
    screenReturnLayout = null;
  }
  return true;
}

// Parar o compartilhamento pelo app (track.stop() não dispara 'ended').
function stopSharing() {
  const s = streams.screen;
  media.stopStream(s);
  onScreenEnded(s);
}

let screenReturnLayout = null;

function onScreenEnded(s) {
  if (!s || streams.screen !== s) return;
  if (state.status === 'contagem') cancelCountdown?.();
  streams.screen = null;
  attach(vScreen, null);
  update({ hasScreen: false });
  // Gravando: a gravação continua e o layout desliza para "Só câmera".
  if (recorder && LAYOUTS[state.layout].screen) {
    screenReturnLayout = state.layout;
    selectLayout('cam');
  }
}

async function enableCamera() {
  let s;
  try {
    s = await media.getCamera(state.camId);
  } catch (e) {
    const why = {
      denied: 'A câmera foi bloqueada. Libere no ícone ao lado do endereço e recarregue.',
      notfound: 'Nenhuma câmera encontrada.',
    }[e.kind] || 'Não conseguimos acessar a câmera. Feche outros apps que estejam usando ela.';
    ui.toast(why, {
      action: { label: 'Usar só tela', onClick: () => selectLayout('screen') },
    });
    return false;
  }
  media.stopStream(streams.cam);
  streams.cam = s;
  attach(vCam, s);
  update({ hasCam: true });
  refreshDevices();
  return true;
}

function disableCamera() {
  media.stopStream(streams.cam);
  streams.cam = null;
  attach(vCam, null);
  update({ hasCam: false });
}

async function enableMic({ quiet = false } = {}) {
  let s;
  try {
    s = await media.getMic(state.micId);
  } catch {
    if (!quiet) ui.toast('Microfone indisponível. A gravação seguirá sem ele.');
    update({ micOn: false });
    return false;
  }
  disableMic();
  streams.mic = s;
  meter = media.createLevelMeter(s);
  refreshDevices();
  return true;
}

// Pede câmera e microfone juntos (um único aviso de permissão).
async function acquireCamAndMic() {
  const cam = LAYOUTS[state.layout].cam && !streams.cam;
  const mic = state.micOn && !streams.mic;
  if (!cam && !mic) return;
  let s;
  try {
    s = await media.getCamAndMic({ camId: state.camId, micId: state.micId, cam, mic });
  } catch {
    // Se o pedido conjunto falhar, tenta cada um para mostrar o motivo certo.
    if (cam) await enableCamera();
    if (mic) await enableMic();
    return;
  }
  if (cam) {
    streams.cam = new MediaStream(s.getVideoTracks());
    attach(vCam, streams.cam);
    update({ hasCam: true });
  }
  if (mic) {
    streams.mic = new MediaStream(s.getAudioTracks());
    meter = media.createLevelMeter(streams.mic);
  }
  refreshDevices();
  fitCanvasToSource();
}

function disableMic() {
  meter?.close();
  meter = null;
  media.stopStream(streams.mic);
  streams.mic = null;
}

function releaseAll() {
  media.stopStream(streams.screen);
  streams.screen = null;
  attach(vScreen, null);
  disableCamera();
  disableMic();
  update({ hasScreen: false });
}

async function refreshDevices() {
  const { cams, mics } = await media.listDevices();
  const camId = streams.cam?.getVideoTracks()[0]?.getSettings().deviceId || state.camId;
  const micId = streams.mic?.getAudioTracks()[0]?.getSettings().deviceId || state.micId;
  update({ cams, mics, camId, micId });
}

// Medidor de nível (RF04c)
(function meterLoop() {
  const level = meter && state.micOn && state.status !== 'pausado' ? meter.read() : 0;
  ui.setMeter(level);
  requestAnimationFrame(meterLoop);
})();

// ---------- Layout ----------
function selectLayout(id) {
  const live = state.status === 'gravando' || state.status === 'pausado';
  if (state.status !== 'configurando' && !live) return;
  if (live && LAYOUTS[id].screen && !streams.screen) return; // não dá para abrir o seletor de tela gravando
  update({ layout: id });
  const L = LAYOUTS[id];
  // A câmera continua ligada ao trocar de layout, para não pedir permissão de novo.
  if (L.cam && !streams.cam) enableCamera();
  fitCanvasToSource();
}

// ---------- Modo automático (RF21) ----------
// Gravando com o modo ligado: nesta aba → só câmera; fora dela (outra aba, janela ou app) → o layout
// que você escolheu nos botões. O layout escolhido não muda; só o que entra no vídeo.
let autoTimer = null;
function applyAutoSwitch() {
  clearTimeout(autoTimer);
  // Pequena espera para ignorar trocas rápidas de foco (ex.: clicar na barra do navegador).
  autoTimer = setTimeout(() => {
    const live = ['contagem', 'gravando', 'pausado'].includes(state.status);
    if (!live || !state.autoSwitch) {
      if (state.autoCam) update({ autoCam: false });
      return;
    }
    // Clicar na minibar flutuante não conta como sair da aba.
    const pipFocused = !!pipWindow()?.document.hasFocus();
    const away = document.hidden || (!pageFocused && !pipFocused);
    const autoCam = !away;
    if (autoCam && !streams.cam) enableCamera();
    if (state.autoCam !== autoCam) update({ autoCam });
  }, 250);
}
// Foco da página: só conta como "saiu" depois de um blur de verdade. Ao fechar o seletor de tela
// o Chrome às vezes não devolve o foco, e aí document.hasFocus() dizia "fora" mesmo nesta aba.
let pageFocused = true;
document.addEventListener('visibilitychange', () => { if (!document.hidden) pageFocused = true; applyAutoSwitch(); });
window.addEventListener('blur', () => { pageFocused = false; applyAutoSwitch(); });
window.addEventListener('focus', () => { pageFocused = true; applyAutoSwitch(); });
document.addEventListener('pointerdown', () => { if (!pageFocused) { pageFocused = true; applyAutoSwitch(); } });

// ---------- Minibar flutuante (RF22) ----------
function openMiniBar() {
  return openPip({ onPause: pause, onResume: resume, onStop: stopRecording, onChange: (open) => update({ pipOpen: open }) });
}

// ---------- Gravação ----------
async function onRecord() {
  // A minibar flutuante e o seletor de tela precisam do clique; se a tela já está
  // compartilhada, abre a minibar já; senão tenta logo depois de escolher a tela.
  const needsShare = LAYOUTS[state.layout].screen && !streams.screen;
  if (!needsShare) await openMiniBar();
  const L = LAYOUTS[state.layout];
  // Tela primeiro: getDisplayMedia precisa do clique "fresco".
  if (L.screen && !streams.screen && !(await shareScreen())) return closePip();
  if (needsShare) await openMiniBar(); // pode não abrir se demorou no seletor: aí tem o botão no dock
  if (L.cam && !streams.cam && !(await enableCamera())) return closePip();
  if (state.micOn && !streams.mic) await enableMic();
  fitCanvasToSource();

  // "Trocar sozinho": já na contagem fica só a câmera, para o vídeo começar sem a tela.
  pageFocused = true; // você acabou de clicar em Gravar aqui
  if (state.autoSwitch && !document.hidden) update({ autoCam: true });
  setStatus('contagem');
  if (!(await countdown())) return closePip();
  startRecording();
  applyAutoSwitch(); // começa em "Só câmera" se você estiver nesta aba
}

function countdown() {
  return new Promise((resolve) => {
    let n = 3;
    ui.showCountdown(n);
    const id = setInterval(() => {
      n -= 1;
      if (n > 0) return ui.showCountdown(n);
      clearInterval(id);
      ui.showCountdown(null);
      cancelCountdown = null;
      resolve(true);
    }, 1000);
    cancelCountdown = () => {
      clearInterval(id);
      ui.showCountdown(null);
      cancelCountdown = null;
      setStatus('configurando');
      update({ autoCam: false });
      resolve(false);
    };
  });
}

function startRecording() {
  const L = LAYOUTS[state.layout];
  const out = canvas.captureStream(30);
  // A câmera continua ligada durante a gravação para poder voltar a um layout com câmera.
  audioMix = media.mixAudio([streams.mic, streams.screen]);
  out.addTrack(audioMix.track);

  recorder = new Recorder(out, { width: canvas.width, height: canvas.height });

  if (state.vertical) {
    compositorV = new Compositor(canvasV, sceneFor, { layoutFn: computeVerticalLayout });
    compositorV.start();
    const outV = canvasV.captureStream(30);
    outV.addTrack(audioMix.track.clone());
    recorderV = new Recorder(outV, { width: canvasV.width, height: canvasV.height });
    recorderV.start();
  }
  recorder.start();
  levelSamples = [];
  stopSampler = ticker(10, () => {
    if (!recorder || state.status !== 'gravando') return;
    levelSamples.push({ t: recorder.elapsed, v: meter && state.micOn ? meter.read() : 0 });
  });
  downloaded = false;
  setStatus('gravando');
  ui.setTimer('00:00');
  timerId = setInterval(() => {
    const t = formatTime(recorder.elapsed);
    ui.setTimer(t);
    updatePip({ status: state.status, time: t });
  }, 250);
}

function pause() {
  recorder?.pause();
  recorderV?.pause();
  setStatus('pausado');
}

function resume() {
  recorder?.resume();
  recorderV?.resume();
  setStatus('gravando');
}

async function stopRecording() {
  if (!recorder) return;
  const r = recorder;
  clearInterval(timerId);
  const rv = recorderV;
  recorderV = null;
  stopSampler?.();
  stopSampler = null;
  const [blob, blobV] = await Promise.all([r.stop(), rv ? rv.stop() : null]);
  recorder = null;
  compositorV?.stop();
  compositorV = null;
  ui.setTimer(formatTime(r.elapsed));
  r.stream.getTracks().forEach((t) => t.stop());
  rv?.stream.getTracks().forEach((t) => t.stop());
  audioMix?.close();
  audioMix = null;
  screenReturnLayout = null;
  update({ autoCam: false });
  closePip();
  releaseAll(); // RNF05: luz da câmera apaga
  const name = fileName(r.extension);
  lastBlob = blob;
  lastBlobV = blobV;
  update({
    blobUrl: URL.createObjectURL(blob),
    fileName: name,
    blobUrlV: blobV ? URL.createObjectURL(blobV) : null,
    fileNameV: blobV ? name.replace('.mp4', '-celular.mp4') : '',
  });
  setStatus('finalizado');
}

function newRecording() {
  if (!downloaded && !confirm('O vídeo ainda não foi baixado. Descartar mesmo assim?')) return;
  if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
  if (state.blobUrlV) URL.revokeObjectURL(state.blobUrlV);
  revokeHighlights();
  revokeMerged();
  lastBlob = null;
  lastBlobV = null;
  update({ blobUrl: null, fileName: '', blobUrlV: null, fileNameV: '', hlStatus: 'idle', hlProgress: 0, preview: 'main', mergeOrder: [], merged: null, mergeStatus: 'idle' });
  ui.setTimer('00:00');
  setStatus('configurando');
  acquireCamAndMic();
  fitCanvasToSource();
}

// ---------- Highlights (RF19) ----------
async function makeHighlights() {
  if (!lastBlob || state.hlStatus === 'working') return;
  const mobile = state.hlFormat === 'mobile' && lastBlobV;
  const source = mobile ? lastBlobV : lastBlob;
  const clips = findHighlights(levelSamples, { pre: state.hlPre * 1000, post: state.hlPost * 1000, sensitivity: state.hlSens });
  if (!clips.length) {
    update({ hlStatus: 'none' });
    ui.toast(levelSamples.length ? 'Não ouvi voz nesta gravação (microfone desligado?).' : 'Sem dados de áudio desta gravação.');
    return;
  }
  ui.toast(clips.length === 1 ? '1 destaque encontrado.' : `${clips.length} destaques encontrados.`);
  update({ hlStatus: 'working', hlProgress: 0 });
  try {
    const blob = await renderHighlights(source, clips, (p) => update({ hlProgress: p }));
    const suffix = mobile ? '-celular-highlights.mp4' : '-highlights.mp4';
    const key = mobile ? 'mobile' : 'desktop';
    if (state.hl[key]) URL.revokeObjectURL(state.hl[key].url);
    const hl = { ...state.hl, [key]: { url: URL.createObjectURL(blob), name: state.fileName.replace('.mp4', suffix) } };
    update({ hlStatus: 'idle', hl, preview: `hl-${key}` }); // já mostra o resultado no player
  } catch (e) {
    console.error(e);
    update({ hlStatus: 'idle' });
    ui.toast('Não foi possível gerar os highlights.');
  }
}

// ---------- Juntar vídeos ----------
// Marca as saídas na ordem e gera um MP4 só, tocando uma depois da outra.
function revokeMerged() {
  if (state.merged) URL.revokeObjectURL(state.merged.url);
}
async function mergeOutputs() {
  if (state.mergeStatus === 'working') return;
  const urls = {
    main: state.blobUrl, vertical: state.blobUrlV, 'hl-desktop': state.hl.desktop?.url, 'hl-mobile': state.hl.mobile?.url,
  };
  const list = state.mergeOrder.map((k) => urls[k]).filter(Boolean);
  if (list.length < 2) return;
  update({ mergeStatus: 'working', mergeProgress: 0 });
  try {
    const blob = await mergeVideos(list, (p) => update({ mergeProgress: p }));
    revokeMerged();
    const merged = { url: URL.createObjectURL(blob), name: state.fileName.replace('.mp4', '-juntado.mp4') };
    update({ mergeStatus: 'idle', merged, preview: 'merged' });
  } catch (e) {
    console.error(e);
    update({ mergeStatus: 'idle' });
    ui.toast('Não foi possível juntar os vídeos.');
  }
}
$('btn-merge').addEventListener('click', mergeOutputs);

// RF14: aviso antes de fechar com vídeo não baixado (ou gravação em andamento).
window.addEventListener('beforeunload', (e) => {
  const unsaved = (state.status === 'finalizado' && !downloaded) || state.status === 'gravando' || state.status === 'pausado';
  if (unsaved) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- Eventos da interface ----------
document.querySelectorAll('[data-layout]').forEach((b) => b.addEventListener('click', () => selectLayout(b.dataset.layout)));
$('btn-share').addEventListener('click', shareScreen);
$('btn-screen').addEventListener('click', () => (streams.screen ? stopSharing() : shareScreen()));
$('btn-reshare').addEventListener('click', shareScreen);
$('btn-record').addEventListener('click', onRecord);
$('btn-cancel').addEventListener('click', () => cancelCountdown?.());
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-stop').addEventListener('click', stopRecording);
// Saídas: ▶ mostra no player, ↓ baixa.
$('outputs').addEventListener('click', (e) => {
  const play = e.target.closest('[data-preview]');
  if (play) update({ preview: play.dataset.preview });
  const pick = e.target.closest('[data-pick]');
  if (pick && state.mergeStatus !== 'working') {
    const k = pick.dataset.pick;
    const order = state.mergeOrder.includes(k) ? state.mergeOrder.filter((x) => x !== k) : [...state.mergeOrder, k];
    update({ mergeOrder: order });
  }
  if (e.target.closest('[data-download]')) downloaded = true;
});
$('vertical').addEventListener('change', (e) => update({ vertical: e.target.checked }));
$('auto-switch').addEventListener('change', (e) => {
  update({ autoSwitch: e.target.checked });
  applyAutoSwitch();
});
$('btn-new').addEventListener('click', newRecording);
$('btn-pip').addEventListener('click', openMiniBar);
$('btn-highlights').addEventListener('click', makeHighlights);
// Mudar qualquer opção depois de gerar volta o botão para "Gerar" (o arquivo anterior é descartado).
// Formato só escolhe qual gerar; antes/depois/sensibilidade mudam o resultado, então descartam os gerados.
function revokeHighlights() {
  for (const h of Object.values(state.hl)) if (h) URL.revokeObjectURL(h.url);
}
function setHlOption(patch) {
  if (state.hlStatus === 'working') return;
  if ('hlFormat' in patch) return update(patch);
  revokeHighlights();
  const preview = state.preview.startsWith('hl-') ? 'main' : state.preview;
  update({ ...patch, hlStatus: 'idle', hl: { desktop: null, mobile: null }, preview, mergeOrder: state.mergeOrder.filter((k) => !k.startsWith('hl-')) });
}
document.querySelectorAll('[data-hl-sens]').forEach((b) => b.addEventListener('click', () => setHlOption({ hlSens: b.dataset.hlSens })));
document.querySelectorAll('[data-hl-format]').forEach((b) => b.addEventListener('click', () => setHlOption({ hlFormat: b.dataset.hlFormat })));
for (const [id, key] of [['hl-pre', 'hlPre'], ['hl-post', 'hlPost']]) {
  $(id).addEventListener('change', (e) => {
    const n = Math.min(10, Math.max(1, Math.round(Number(e.target.value) || state[key])));
    setHlOption({ [key]: n });
  });
}

$('btn-mic').addEventListener('click', async () => {
  const on = !state.micOn;
  update({ micOn: on });
  // Só silencia a trilha: desligar e ligar de novo faria o navegador pedir permissão outra vez.
  if (streams.mic) streams.mic.getAudioTracks().forEach((t) => (t.enabled = on));
  else if (on) await enableMic();
});

$('settings').addEventListener('toggle', (e) => e.newState === 'open' && ui.positionSettings());
window.addEventListener('resize', () => $('settings').matches(':popover-open') && ui.positionSettings());

document.querySelectorAll('[data-corner]').forEach((b) => b.addEventListener('click', () => update({ bubbleCorner: b.dataset.corner })));
document.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => update({ bubbleSize: b.dataset.size })));
document.querySelectorAll('[data-shape]').forEach((b) => b.addEventListener('click', () => update({ camShape: b.dataset.shape })));
$('cam-zoom').addEventListener('change', (e) => update({ camZoom: e.target.checked }));
$('zoom-amount').addEventListener('input', (e) => update({ zoomAmount: Number(e.target.value) / 100 }));
document.querySelectorAll('[data-zoom-speed]').forEach((b) => b.addEventListener('click', () => update({ zoomSpeed: b.dataset.zoomSpeed })));
$('split-ratio').addEventListener('input', (e) => update({ splitRatio: Number(e.target.value) / 100 }));
document.querySelectorAll('[data-border]').forEach((b) => b.addEventListener('click', () => update({ camBorder: b.dataset.border })));

document.querySelector('[data-bg=none]').addEventListener('click', () => {
  background.mode = 'none';
  update({ bgMode: 'none' });
});
function setColor(c) {
  background.mode = 'color';
  background.color = c;
  update({ bgMode: 'color', bgColor: c });
}
document.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => setColor(b.dataset.color)));
$('bg-color').addEventListener('input', (e) => setColor(e.target.value));
$('bg-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    await background.setFile(file);
    background.mode = 'file';
    update({ bgMode: 'file', bgFileName: file.name });
    saveBackgroundFile(file);
  } catch (err) {
    ui.toast(err.message); // CA14: mantém o fundo anterior
  }
});

$('cam-select').addEventListener('change', (e) => {
  update({ camId: e.target.value });
  if (streams.cam) enableCamera();
});
$('mic-select').addEventListener('change', (e) => {
  update({ micId: e.target.value });
  if (streams.mic) enableMic();
});
$('tab-audio').addEventListener('change', (e) => {
  update({ tabAudio: e.target.checked });
  if (streams.screen) ui.toast('Vale a partir do próximo compartilhamento de tela.', { action: { label: 'Compartilhar de novo', onClick: shareScreen } });
});

// ---------- Preferências salvas ----------
function restoreSettings() {
  const saved = loadSettings();
  // Layout salvo que este navegador não suporta (ex.: sem captura de tela) é ignorado.
  if (saved.layout && !LAYOUTS[saved.layout]) delete saved.layout;
  if (!media.support.display && saved.layout && LAYOUTS[saved.layout].screen) delete saved.layout;
  Object.assign(state, saved);
  background.color = state.bgColor;
  background.mode = state.bgMode === 'file' ? 'none' : state.bgMode;
  if (state.bgMode === 'file') restoreBackgroundFile(); // em paralelo: não segura a abertura do app
}

async function restoreBackgroundFile() {
  {
    const blob = await loadBackgroundFile();
    if (blob) {
      try {
        await background.setFile(new File([blob], state.bgFileName || 'fundo', { type: blob.type }));
        background.mode = 'file';
      } catch {
        background.mode = 'color';
        update({ bgMode: 'color' });
      }
    } else {
      background.mode = 'color';
      update({ bgMode: 'color' });
    }
  }
}

// ---------- Início ----------
async function init() {
  if (!media.support.secure) {
    ui.banner('Abra esta página por http://localhost ou HTTPS para liberar câmera e tela.');
  }
  if (!media.support.display) {
    // CA11: sem captura de tela (ex.: celular)
    document.querySelectorAll('[data-layout]').forEach((b) => (b.disabled = LAYOUTS[b.dataset.layout].screen) && (b.dataset.unsupported = '1'));
    update({ layout: 'cam' });
    ui.banner('Este navegador não grava a tela. Dá para usar o layout "Só câmera".');
  }
  if (!media.support.user) {
    ui.banner('Este navegador bloqueou câmera e microfone nesta página. Abra no Chrome, ou por http://localhost.');
  }
  if (media.support.recorder && !supportsMp4()) {
    $('btn-record').disabled = true;
    ui.banner('Este navegador não grava em MP4. Use o Chrome, o Edge ou o Safari atualizados.');
  }
  if (!media.support.recorder || !media.support.user) {
    $('btn-record').disabled = true;
    ui.banner('Este navegador não suporta gravação. Use a versão atual do Chrome, Edge ou Firefox.');
  }

  restoreSettings();
  subscribe(ui.render);
  subscribe(saveSettings);
  subscribe((s) => updatePip({ status: s.status }));
  try {
    compositor.start();
  } catch (e) {
    console.error(e);
  }

  // Já pede câmera e microfone ao abrir, para o preview mostrar a câmera de cara.
  if (media.support.user) await acquireCamAndMic();
  refreshDevices();
}

init();
