// Salva as preferências no próprio navegador: localStorage para as opções,
// IndexedDB para a imagem/vídeo de fundo. Nada sai da máquina.
const KEY = 'gravador:ajustes:v1';
const SAVED = [
  'layout', 'bubbleCorner', 'bubbleSize', 'camShape', 'camBorder', 'splitRatio',
  'camZoom', 'zoomAmount', 'zoomSpeed', 'bgMode', 'bgColor', 'bgFileName',
  'tabAudio', 'micOn', 'camId', 'micId', 'vertical', 'autoSwitch', 'hlPre', 'hlPost', 'hlSens', 'hlFormat',
];

export function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    // "Trocar sozinho" passou a vir ligado: ignora o valor salvo antes dessa mudança (sem autoV).
    if (data.autoV !== 2) delete data.autoSwitch;
    return Object.fromEntries(SAVED.filter((k) => k in data).map((k) => [k, data[k]]));
  } catch {
    return {};
  }
}

let timer = null;
let lastJson = '';
export function saveSettings(state) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const json = JSON.stringify({ ...Object.fromEntries(SAVED.map((k) => [k, state[k]])), autoV: 2 });
    if (json === lastJson) return;
    lastJson = json;
    try {
      localStorage.setItem(KEY, json);
    } catch {
      /* armazenamento cheio ou bloqueado: segue sem salvar */
    }
  }, 300);
}

// ---------- Arquivo de fundo (IndexedDB) ----------
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('gravador', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('arquivos');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const d = await Promise.race([db(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))]);
  return new Promise((resolve, reject) => {
    const t = d.transaction('arquivos', mode);
    const req = fn(t.objectStore('arquivos'));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export async function saveBackgroundFile(file) {
  try {
    await tx('readwrite', (s) => s.put(file, 'fundo'));
  } catch {
    /* sem IndexedDB: o fundo só não volta na próxima vez */
  }
}

export async function loadBackgroundFile() {
  try {
    const blob = await tx('readonly', (s) => s.get('fundo'));
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}
