// Desenha fundo, tela e câmera num canvas. O mesmo canvas é o preview e a fonte da gravação.
import { computeLayout } from './layouts.js';

const unitOf = (canvas) => Math.min(canvas.width, canvas.height) / 720;

export function fitContain(sw, sh, r) {
  const s = Math.min(r.w / sw, r.h / sh);
  const w = sw * s;
  const h = sh * s;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

export function coverSource(sw, sh, dw, dh) {
  const s = Math.max(dw / sw, dh / sh);
  const w = dw / s;
  const h = dh / s;
  return { sx: (sw - w) / 2, sy: (sh - h) / 2, sw: w, sh: h };
}

const isReady = (v) => v && v.readyState >= 2 && v.videoWidth > 0;

function roundedPath(ctx, r, radius) {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, rad);
  else ctx.rect(r.x, r.y, r.w, r.h);
}

// Transições: cada propriedade anda em direção ao alvo com suavização exponencial.
// TAU de 70 ms faz a mudança assentar em ~300 ms e aceita mudar de alvo no meio do caminho.
const TAU = 70;
const BG_FADE_MS = 350;
const KEYS = ['x', 'y', 'w', 'h', 'radius', 'a'];

function step(cur, target, k) {
  if (!cur && !target) return null;
  // Elemento que aparece: nasce no lugar final, 96% do tamanho e transparente.
  if (!cur) cur = { ...target, ...shrink(target, 0.96), a: 0 };
  const goal = target ? { ...target, a: 1 } : { ...cur, ...shrink(cur, 0.96), a: 0 };
  const next = { ...goal };
  for (const key of KEYS) next[key] = cur[key] + (goal[key] - cur[key]) * k;
  if (!target && next.a < 0.02) return null;
  return next;
}

function shrink(r, s) {
  const w = r.w * s;
  const h = r.h * s;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

const BORDER = { none: 0, thin: 4, thick: 12 };
const ZOOM_PERIOD = { slow: 12000, normal: 8000, fast: 4500 }; // ms por ciclo

export class Compositor {
  constructor(canvas, getScene, { layoutFn = computeLayout } = {}) {
    this.canvas = canvas;
    this.layoutFn = layoutFn;
    this.ctx = canvas.getContext('2d');
    this.getScene = getScene;
    this.cur = { screen: null, cam: null, border: BORDER.thin, zoom: 0 };
    this.bgLayer = document.createElement('canvas');
    this.bgPrev = document.createElement('canvas');
    this.bgKey = null;
    this.bgFadeStart = 0;
    this.last = 0;
    this.size = '';
  }

  // Timer num Worker: continua batendo a ~30 fps mesmo com a aba em segundo plano.
  start() {
    const code = 'setInterval(() => postMessage(0), 1000 / 30);';
    try {
      this.worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      this.worker.onmessage = () => this.draw();
    } catch {
      // Aberto como arquivo (file://) o Worker pode ser bloqueado: usa timer comum.
      this.timer = setInterval(() => this.draw(), 1000 / 30);
    }
    this.draw();
  }

  stop() {
    this.worker?.terminate();
    clearInterval(this.timer);
  }

  draw() {
    const { ctx } = this;
    const { width: W, height: H } = this.canvas;
    const s = this.getScene();
    const framed = s.background.active;
    const v = s.screenVideo;
    const screenAspect = isReady(v) ? v.videoWidth / v.videoHeight : 16 / 9;
    const L = this.layoutFn(s.layout, {
      width: W, height: H, framed, corner: s.corner, size: s.size, shape: s.shape, screenAspect, splitRatio: s.splitRatio,
    });

    // Tempo desde o último quadro → fator de suavização.
    const now = performance.now();
    const dt = this.last ? Math.min(100, now - this.last) : 1000;
    this.last = now;
    let k = 1 - Math.exp(-dt / TAU);

    // Mudou a resolução do canvas: sem animação, encaixa direto.
    const size = `${W}x${H}`;
    if (size !== this.size) {
      this.size = size;
      this.cur = { ...this.cur, screen: null, cam: null };
      for (const c of [this.bgLayer, this.bgPrev]) Object.assign(c, { width: W, height: H });
      k = 1;
    }

    this.drawBackground(s.background, W, H, now);

    const screenTarget = L.screen && { ...L.screen, shadow: framed || s.layout === 'split' };
    this.cur.screen = step(this.cur.screen, screenTarget, k);
    this.cur.cam = step(this.cur.cam, L.cam, k);
    this.cur.border += ((BORDER[s.border] ?? BORDER.thin) - this.cur.border) * k;
    this.cur.zoom += ((s.camZoom ? 1 : 0) - this.cur.zoom) * (1 - Math.exp(-dt / 250)); // liga/desliga devagar

    if (this.cur.screen) this.drawScreen(s.screenVideo, this.cur.screen);
    if (this.cur.cam) this.drawCam(s.camVideo, this.cur.cam, this.cur.border, this.zoomScale(Math.min(dt, 100), s.zoomAmount ?? 0.15, ZOOM_PERIOD[s.zoomSpeed] ?? 8000));
  }

  // Fundo em camada própria para poder fazer fade entre o anterior e o novo.
  drawBackground(bg, W, H, now) {
    const key = `${bg.mode}|${bg.color}|${bg.url}`;
    if (this.bgKey !== null && key !== this.bgKey) {
      const p = this.bgPrev.getContext('2d');
      p.clearRect(0, 0, W, H);
      p.drawImage(this.bgLayer, 0, 0);
      this.bgFadeStart = now;
    }
    this.bgKey = key;

    const b = this.bgLayer.getContext('2d');
    b.fillStyle = '#09090b';
    b.fillRect(0, 0, W, H);
    bg.draw(b, W, H);

    const { ctx } = this;
    ctx.drawImage(this.bgLayer, 0, 0);
    const t = (now - this.bgFadeStart) / BG_FADE_MS;
    if (t < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - (1 - (1 - t) ** 3); // ease-out
      ctx.drawImage(this.bgPrev, 0, 0);
      ctx.restore();
    }
  }

  drawScreen(v, r) {
    const { ctx } = this;
    const u = unitOf(this.canvas);
    ctx.save();
    ctx.globalAlpha = r.a;
    if (r.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = 40 * u;
      ctx.shadowOffsetY = 12 * u;
    }
    roundedPath(ctx, r, r.radius);
    ctx.fillStyle = '#18181b';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    if (isReady(v)) ctx.drawImage(v, r.x, r.y, r.w, r.h);
    // Sem tela: só o card vazio. O botão "Compartilhar tela" fica por cima no preview.
    ctx.restore();
  }

  // Zoom em loop ("respiração"): vai e volta com curva senoidal.
  // A fase acumula, então mudar a velocidade não dá salto.
  zoomScale(dt, amount, period) {
    this.zoomPhase = ((this.zoomPhase || 0) + dt / period) % 1;
    this.cur.zoomAmount = (this.cur.zoomAmount ?? amount) + (amount - (this.cur.zoomAmount ?? amount)) * (1 - Math.exp(-dt / 150));
    const wave = 0.5 - 0.5 * Math.cos(2 * Math.PI * this.zoomPhase);
    return 1 + this.cur.zoomAmount * wave * this.cur.zoom;
  }

  // Redondo e quadrado usam o mesmo caminho (raio = metade do lado vira círculo),
  // então a troca de formato também é animada.
  drawCam(v, r, borderPx, zoom = 1) {
    const { ctx } = this;
    const u = unitOf(this.canvas);
    ctx.save();
    ctx.globalAlpha = r.a;
    ctx.shadowColor = 'rgba(0,0,0,.4)';
    ctx.shadowBlur = 30 * u;
    ctx.shadowOffsetY = 8 * u;
    roundedPath(ctx, r, r.radius);
    ctx.fillStyle = '#27272a';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    if (isReady(v)) {
      const c = coverSource(v.videoWidth, v.videoHeight, r.w, r.h);
      // O zoom recorta um pedaço menor do centro: o card não muda de tamanho.
      const sw = c.sw / zoom;
      const sh = c.sh / zoom;
      ctx.drawImage(v, c.sx + (c.sw - sw) / 2, c.sy + (c.sh - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
    } else {
      this.label('Câmera desligada', r);
    }
    ctx.restore();

    const lw = borderPx * u;
    if (lw > 0.3) {
      const half = lw / 2;
      ctx.save();
      ctx.globalAlpha = r.a;
      roundedPath(ctx, { x: r.x + half, y: r.y + half, w: r.w - lw, h: r.h - lw }, Math.max(0, r.radius - half));
      ctx.lineWidth = lw;
      ctx.strokeStyle = 'rgba(255,255,255,.92)';
      ctx.stroke();
      ctx.restore();
    }
  }

  label(text, r) {
    const { ctx } = this;
    ctx.fillStyle = '#71717a';
    ctx.font = `500 ${Math.round(Math.max(14, Math.min(22, r.w / 16)) * unitOf(this.canvas))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, r.x + r.w / 2, r.y + r.h / 2);
  }
}
