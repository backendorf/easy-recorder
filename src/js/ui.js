// Tudo que mexe no DOM: renderização por estado, avisos, medidor, contagem.
import { LAYOUTS } from './layouts.js';
import { pipSupported } from './pip.js';

export const $ = (id) => document.getElementById(id);
const show = (el, on) => (el.hidden = !on);
const press = (el, on) => el.setAttribute('aria-pressed', String(on));

export function render(s) {
  const st = s.status;
  const setup = st === 'configurando';
  const live = st === 'gravando' || st === 'pausado';
  const layout = LAYOUTS[s.layout];

  // Dock
  // Layouts ficam disponíveis também durante a gravação; ajustes só antes de gravar.
  for (const id of ['layouts', 'sep-layouts']) show($(id), setup || live);
  for (const id of ['sep-settings', 'btn-settings']) show($(id), setup);
  show($('btn-screen'), live);
  show($('btn-pip'), live && pipSupported && !s.pipOpen);
  // Selo discreto quando o vídeo está só com a câmera por estar nesta aba.
  show($('auto-badge'), live && s.autoCam && s.layout !== 'cam');
  $('btn-screen').setAttribute('aria-label', s.hasScreen ? 'Parar de compartilhar a tela' : 'Compartilhar a tela');
  $('btn-screen').title = s.hasScreen ? 'Parar de compartilhar' : 'Compartilhar tela';
  $('screen-slash').classList.toggle('hidden', s.hasScreen);
  $('btn-screen').classList.toggle('text-rose-400', !s.hasScreen);
  show($('btn-record'), setup);
  show($('btn-cancel'), st === 'contagem');
  show($('timer'), live || st === 'finalizado');
  show($('btn-pause'), st === 'gravando');
  show($('btn-resume'), st === 'pausado');
  show($('btn-stop'), live);
  show($('btn-new'), st === 'finalizado');
  show($('outputs'), st === 'finalizado');
  if (st === 'finalizado') renderOutputs(s);
  const fin = st === 'finalizado';
  show($('hl-panel'), fin);
  const hasV = !!s.blobUrlV;
  document.querySelectorAll('[data-hl-format]').forEach((b) => {
    const isMobile = b.dataset.hlFormat === 'mobile';
    b.disabled = s.hlStatus === 'working' || (isMobile && !hasV);
    b.title = isMobile && !hasV ? 'Ligue "Gerar versão para celular" nos ajustes antes de gravar' : '';
    press(b, b.dataset.hlFormat === (isMobile || hasV ? s.hlFormat : 'desktop') && !(isMobile && !hasV));
  });
  if (!hasV) press(document.querySelector('[data-hl-format=desktop]'), true);
  for (const b of document.querySelectorAll('[data-hl-sens], #hl-pre, #hl-post')) b.disabled = s.hlStatus === 'working';
  $('btn-highlights').disabled = s.hlStatus === 'working';
  // Juntar vídeos: aparece no fim quando há mais de um vídeo.
  const outs = fin ? outputsOf(s) : [];
  const picked = s.mergeOrder.filter((k) => outs.some((o) => o.key === k));
  show($('merge-panel'), outs.filter((o) => o.key !== 'merged').length > 1);
  $('btn-merge').disabled = s.mergeStatus === 'working' || picked.length < 2;
  $('merge-label').textContent =
    s.mergeStatus === 'working' ? `Juntando ${Math.round(s.mergeProgress * 100)}%` : picked.length >= 2 ? `Juntar ${picked.length}` : 'Juntar';
  $('hl-label').textContent =
    s.hlStatus === 'working' ? `Gerando ${Math.round(s.hlProgress * 100)}%` : 'Gerar';
  $('timer').classList.toggle('text-amber-300', st === 'pausado');

  document.querySelectorAll('[data-layout]').forEach((b) => {
    press(b, b.dataset.layout === s.layout);
    // Gravando sem tela compartilhada, layouts com tela ficam indisponíveis.
    if (!b.dataset.unsupported) b.disabled = live && LAYOUTS[b.dataset.layout].screen && !s.hasScreen;
  });

  // Microfone
  $('btn-mic').classList.toggle('text-rose-400', !s.micOn);
  $('btn-mic').setAttribute('aria-label', s.micOn ? 'Desligar microfone' : 'Ligar microfone');
  $('mic-slash').classList.toggle('hidden', s.micOn);
  if (st === 'finalizado') show($('btn-mic').parentElement.querySelector('[role=meter]'), false);
  else show($('btn-mic').parentElement.querySelector('[role=meter]'), true);
  show($('btn-mic'), st !== 'finalizado');

  // Preview / resultado
  show($('empty'), setup && layout.screen && !s.hasScreen);
  show($('result'), st === 'finalizado');
  const current = st === 'finalizado' ? outputsOf(s).find((o) => o.key === s.preview) || outputsOf(s)[0] : null;
  if (current && $('result').src !== current.url) $('result').src = current.url;
  if (st !== 'finalizado' && $('result').getAttribute('src')) {
    $('result').removeAttribute('src');
    $('result').load();
  }

  // Ajustes
  show($('cam-opts'), layout.cam);
  show($('bubble-opts'), s.layout === 'bubble');
  show($('split-opts'), s.layout === 'split');
  const pct = Math.round(s.splitRatio * 100);
  if (Number($('split-ratio').value) !== pct) $('split-ratio').value = String(pct);
  $('split-label').textContent = `Tela ${pct}% · Câmera ${100 - pct}%`;
  document.querySelectorAll('[data-shape]').forEach((b) => press(b, b.dataset.shape === s.camShape));
  document.querySelectorAll('[data-border]').forEach((b) => press(b, b.dataset.border === s.camBorder));
  document.querySelectorAll('[data-corner]').forEach((b) => press(b, b.dataset.corner === s.bubbleCorner));
  document.querySelectorAll('[data-size]').forEach((b) => press(b, b.dataset.size === s.bubbleSize));
  press(document.querySelector('[data-bg=none]'), s.bgMode === 'none');
  document.querySelectorAll('[data-color]').forEach((b) =>
    press(b, s.bgMode === 'color' && b.dataset.color.toLowerCase() === s.bgColor.toLowerCase()),
  );
  show($('bg-file-name'), s.bgMode === 'file' && !!s.bgFileName);
  $('bg-file-name').textContent = s.bgFileName;
  $('screen-status').textContent = s.hasScreen ? 'Tela compartilhada' : 'Tela não compartilhada';
  show($('btn-reshare'), layout.screen);
  show($('cam-select'), layout.cam);
  $('mic-select').disabled = !s.micOn;
  fillSelect($('cam-select'), s.cams, s.camId, 'Câmera padrão');
  fillSelect($('mic-select'), s.mics, s.micId, 'Microfone padrão');
  $('tab-audio').checked = s.tabAudio;
  $('cam-zoom').checked = s.camZoom;
  $('vertical').checked = s.vertical;
  $('auto-switch').checked = s.autoSwitch;
  document.querySelectorAll('[data-hl-sens]').forEach((b) => press(b, b.dataset.hlSens === s.hlSens));
  if (document.activeElement !== $('hl-pre')) $('hl-pre').value = String(s.hlPre);
  if (document.activeElement !== $('hl-post')) $('hl-post').value = String(s.hlPost);
  show($('zoom-opts'), s.camZoom);
  const zpct = Math.round(s.zoomAmount * 100);
  if (Number($('zoom-amount').value) !== zpct) $('zoom-amount').value = String(zpct);
  $('zoom-label').textContent = `${zpct}%`;
  document.querySelectorAll('[data-zoom-speed]').forEach((b) => press(b, b.dataset.zoomSpeed === s.zoomSpeed));

  if (!setup && $('settings').matches(':popover-open')) $('settings').hidePopover();
}

// Lista de saídas do fim da gravação.
function outputsOf(s) {
  return [
    s.blobUrl && { key: 'main', label: 'Desktop', url: s.blobUrl, name: s.fileName },
    s.blobUrlV && { key: 'vertical', label: 'Celular', url: s.blobUrlV, name: s.fileNameV },
    s.hl.desktop && { key: 'hl-desktop', label: 'Highlights', url: s.hl.desktop.url, name: s.hl.desktop.name },
    s.hl.mobile && { key: 'hl-mobile', label: 'Highlights celular', url: s.hl.mobile.url, name: s.hl.mobile.name },
    s.merged && { key: 'merged', label: 'Juntado', url: s.merged.url, name: s.merged.name },
  ].filter(Boolean);
}

const PLAY = '<svg class="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>';
const DOWN = '<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>';

function renderOutputs(s) {
  const list = outputsOf(s);
  const active = list.some((o) => o.key === s.preview) ? s.preview : list[0]?.key;
  const order = s.mergeOrder;
  const picking = list.length > 1;
  const key = JSON.stringify([list.map((o) => o.url), active, order, picking]);
  const box = $('outputs');
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.replaceChildren(
    ...list.map((o) => {
      const on = o.key === active;
      const el = document.createElement('div');
      el.className = `flex h-10 items-center rounded-full transition ${on ? 'bg-white text-zinc-900' : 'bg-white/10 text-zinc-100'}`;
      const n = order.indexOf(o.key) + 1;
      // Bolinha para marcar a ordem do "Juntar" (1, 2, 3... na ordem do clique).
      const pick = picking && o.key !== 'merged'
        ? `<button data-pick="${o.key}" aria-pressed="${n > 0}" title="${n ? 'Tirar da junção' : 'Marcar para juntar'}" class="ml-1.5 grid size-6 place-items-center rounded-full text-[11px] font-semibold ring-1 ${n ? 'bg-emerald-400 text-zinc-900 ring-emerald-400' : on ? 'ring-zinc-900/30' : 'ring-white/30'} outline-none focus-visible:ring-2">${n || ''}</button>`
        : '';
      el.innerHTML = `${pick}
        <button data-preview="${o.key}" aria-pressed="${on}" title="Ver no player" class="flex h-full items-center gap-1.5 rounded-l-full pl-3.5 pr-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/60">${PLAY}${o.label}</button>
        <span class="h-5 w-px ${on ? 'bg-zinc-900/15' : 'bg-white/10'}"></span>
        <a data-download href="${o.url}" download="${o.name}" title="Baixar ${o.label}" aria-label="Baixar ${o.label}" class="grid h-full place-items-center rounded-r-full pl-2 pr-3 outline-none ${on ? 'hover:bg-zinc-900/5' : 'hover:bg-white/10'} focus-visible:ring-2 focus-visible:ring-white/60">${DOWN}</a>`;
      return el;
    }),
  );
}

function fillSelect(sel, items, value, fallback) {
  const key = JSON.stringify([items, value]);
  if (sel.dataset.key === key) return;
  sel.dataset.key = key;
  sel.replaceChildren(
    ...(items.length ? items : [{ id: '', label: fallback }]).map((d) => new Option(d.label, d.id, false, d.id === value)),
  );
}

export function setTimer(text) {
  $('timer').textContent = text;
}

let meterLevel = 0;
export function setMeter(level) {
  // Sobe rápido, desce devagar: leitura mais agradável.
  meterLevel = level > meterLevel ? level : meterLevel * 0.85;
  const pct = Math.round(meterLevel * 100);
  $('meter').style.height = `${pct}%`;
  $('meter').classList.toggle('bg-amber-400', pct > 90);
  $('meter').classList.toggle('bg-emerald-400', pct <= 90);
  $('meter').parentElement.parentElement.setAttribute('aria-valuenow', String(pct));
}

export function showCountdown(n) {
  show($('countdown'), n != null);
  if (n != null) {
    const el = $('countdown-num');
    el.textContent = String(n);
    el.classList.remove('pop');
    void el.offsetWidth; // reinicia a animação a cada número
    el.classList.add('pop');
  }
}

export function banner(text) {
  show($('banner'), !!text);
  $('banner').textContent = text || '';
}

export function toast(message, { action, timeout = 6000 } = {}) {
  const el = document.createElement('div');
  el.className = 'flex items-center gap-4 rounded-full bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 shadow-xl ring-1 ring-white/10';
  el.append(Object.assign(document.createElement('span'), { textContent: message }));
  if (action) {
    const b = document.createElement('button');
    b.className = 'font-medium text-rose-300 hover:text-rose-200';
    b.textContent = action.label;
    b.onclick = () => {
      action.onClick();
      el.remove();
    };
    el.append(b);
  }
  $('toasts').append(el);
  setTimeout(() => el.remove(), timeout);
}

// Abre o menu de ajustes logo acima do dock, alinhado à direita.
export function positionSettings() {
  const p = $('settings');
  const d = $('dock').getBoundingClientRect();
  p.style.inset = 'auto';
  p.style.position = 'fixed';
  p.style.left = `${Math.max(12, d.right - p.offsetWidth)}px`;
  p.style.top = `${Math.max(12, d.top - p.offsetHeight - 12)}px`;
}
