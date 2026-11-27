// Minibar flutuante (Document Picture-in-Picture): fica por cima de qualquer app enquanto grava.
// Chrome e Edge suportam; nos outros navegadores o app segue sem ela.
// Estilos via element.style (sem CSS inline), para funcionar com a CSP do deploy.
export const pipSupported = 'documentPictureInPicture' in window;

let win = null;
let els = null;
let pipOnChange = () => {};

export const pipWindow = () => win;

function el(doc, tag, style, text) {
  const e = doc.createElement(tag);
  Object.assign(e.style, style);
  if (text) e.textContent = text;
  return e;
}

const BTN = {
  height: '34px', padding: '0 14px', border: '0', borderRadius: '999px', cursor: 'pointer',
  font: '500 13px ui-sans-serif, system-ui, -apple-system, sans-serif', color: '#fafafa',
  background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', gap: '6px',
};

/** Abre a minibar. Precisa ser chamada direto no clique do usuário. */
export async function openPip({ onPause, onResume, onStop, onChange = () => {} }) {
  if (!pipSupported || win) return;
  pipOnChange = onChange;
  try {
    win = await window.documentPictureInPicture.requestWindow({ width: 300, height: 64 });
  } catch {
    win = null;
    return;
  }
  const doc = win.document;
  doc.title = 'Easy Recorder';
  Object.assign(doc.body.style, {
    margin: '0', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '8px', padding: '0 12px', boxSizing: 'border-box', background: '#18181b', color: '#fafafa',
    font: '500 13px ui-sans-serif, system-ui, -apple-system, sans-serif', userSelect: 'none',
  });

  const left = el(doc, 'div', { display: 'flex', alignItems: 'center', gap: '8px' });
  const dot = el(doc, 'span', { width: '9px', height: '9px', borderRadius: '50%', background: '#f43f5e' });
  const timer = el(doc, 'span', { fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, monospace', color: '#d4d4d8' }, '00:00');
  left.append(dot, timer);

  const right = el(doc, 'div', { display: 'flex', alignItems: 'center', gap: '6px' });
  const pause = el(doc, 'button', BTN, 'Pausar');
  const stop = el(doc, 'button', { ...BTN, background: '#f43f5e' }, 'Parar');
  pause.addEventListener('click', () => (pause.dataset.paused === '1' ? onResume() : onPause()));
  stop.addEventListener('click', onStop);
  right.append(pause, stop);

  doc.body.append(left, right);
  els = { dot, timer, pause };
  win.addEventListener('pagehide', () => {
    win = null;
    els = null;
    pipOnChange(false);
  });
  pipOnChange(true);
}

export function updatePip({ status, time }) {
  if (!els) return;
  if (time) els.timer.textContent = time;
  const paused = status === 'pausado';
  els.pause.dataset.paused = paused ? '1' : '0';
  els.pause.textContent = paused ? 'Retomar' : status === 'contagem' ? '…' : 'Pausar';
  els.pause.disabled = status === 'contagem';
  els.dot.style.background = paused ? '#fbbf24' : '#f43f5e';
  els.timer.style.color = paused ? '#fcd34d' : '#d4d4d8';
}

export function closePip() {
  win?.close();
  win = null;
  els = null;
  pipOnChange(false);
}
