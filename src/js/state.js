// Estado único do app + máquina de estados (spec, seção 7).
const listeners = new Set();

export const state = {
  status: 'configurando',
  layout: 'bubble',
  bubbleCorner: 'br',
  bubbleSize: 'md',
  camShape: 'circle',
  camBorder: 'thin',
  splitRatio: 0.7,
  camZoom: false,
  zoomAmount: 0.15,
  zoomSpeed: 'normal',
  bgMode: 'color',
  bgColor: '#6d5dfc',
  bgFileName: '',
  tabAudio: false,
  micOn: true,
  camId: '',
  micId: '',
  cams: [],
  mics: [],
  hasScreen: false,
  hasCam: false,
  blobUrl: null,
  fileName: '',
  vertical: true,
  pipOpen: false,
  autoCam: false, // true = gravando nesta aba com "Trocar sozinho": vídeo só com a câmera
  autoSwitch: true, // câmera nesta aba, tela fora dela
  blobUrlV: null,
  fileNameV: '',
  hlPre: 3, // segundos antes de cada pico
  hlPost: 4, // segundos depois
  hlSens: 'medium',
  hlFormat: 'desktop', // desktop | mobile // sensibilidade: low | medium | high
  hlStatus: 'idle', // idle | working | ready | none
  hlProgress: 0,
  hl: { desktop: null, mobile: null }, // { url, name } de cada highlight gerado
  preview: 'main', // main | vertical | hl-desktop | hl-mobile
};

const transitions = {
  configurando: ['contagem'],
  contagem: ['gravando', 'configurando'],
  gravando: ['pausado', 'finalizado'],
  pausado: ['gravando', 'finalizado'],
  finalizado: ['configurando'],
};

export function setStatus(next) {
  if (!transitions[state.status].includes(next)) return false;
  state.status = next;
  emit();
  return true;
}

export function update(patch) {
  Object.assign(state, patch);
  emit();
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(state);
}
