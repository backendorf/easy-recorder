// Funções puras que calculam onde tela e câmera ficam em cada layout (spec, seção 4).
// Tudo é medido a partir da área útil e centralizado; os tamanhos escalam com a altura do vídeo.
export const LAYOUTS = {
  screen: { label: 'Só tela', screen: true, cam: false },
  bubble: { label: 'Tela + câmera', screen: true, cam: true },
  cam: { label: 'Só câmera', screen: false, cam: true },
  split: { label: 'Lado a lado', screen: true, cam: true },
};

const BUBBLE = { sm: 0.22, md: 0.3, lg: 0.4 }; // diâmetro como fração da altura da tela

// Maior retângulo com a proporção `aspect` que cabe em `r`, centralizado.
function fit(aspect, r) {
  const w = Math.min(r.w, r.h * aspect);
  const h = w / aspect;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

const round = (r) => ({ ...r, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

export function computeLayout(
  id,
  { width: W, height: H, framed, corner = 'br', size = 'md', shape = 'circle', screenAspect = 16 / 9, splitRatio = 0.7 },
) {
  const u = H / 720; // unidade: 1 px em 720p
  const pad = framed ? 48 * u : 0;
  const radius = framed ? 16 * u : 0;
  const area = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };

  switch (id) {
    case 'screen':
      return { screen: round({ ...fit(screenAspect, area), radius }), cam: null };

    case 'cam': {
      // Sempre um card com margem e cantos arredondados (como no lado a lado), nunca a tela inteira:
      // assim o fundo e a borda continuam aparecendo em volta da câmera.
      const m = 24 * u;
      const a = framed ? area : { x: m, y: m, w: W - 2 * m, h: H - 2 * m };
      return { screen: null, cam: round({ ...a, radius: Math.max(radius, 12 * u), shape: 'rect' }) };
    }

    case 'bubble': {
      // A bolha se alinha aos cantos da própria tela, não do vídeo.
      const sc = fit(screenAspect, area);
      const d = Math.round(sc.h * BUBBLE[size]);
      const m = Math.round(sc.h * 0.04);
      const x = corner.includes('l') ? sc.x + m : sc.x + sc.w - m - d;
      const y = corner.includes('t') ? sc.y + m : sc.y + sc.h - m - d;
      const cam =
        shape === 'square'
          ? { x, y, w: d, h: d, radius: Math.round(d * 0.18), shape: 'rect' }
          : { x, y, w: d, h: d, radius: d / 2, shape: 'circle' };
      return { screen: round({ ...sc, radius }), cam: round(cam) };
    }

    case 'split': {
      // Tela e câmera com a mesma altura, separadas por um espaço fixo, o conjunto centralizado.
      const gap = 24 * u;
      // Sem fundo, ainda deixa uma margem igual ao espaço entre os cards.
      const a = framed ? area : { x: gap, y: gap, w: W - 2 * gap, h: H - 2 * gap };
      // splitRatio = fração da largura dos cards que fica com a tela (0,5 a 0,8).
      const ratio = Math.min(0.8, Math.max(0.5, splitRatio));
      const h = Math.min(a.h, ((a.w - gap) * ratio) / screenAspect);
      const sw = h * screenAspect;
      const cw = (sw * (1 - ratio)) / ratio;
      const x0 = a.x + (a.w - (sw + gap + cw)) / 2;
      const y0 = a.y + (a.h - h) / 2;
      const r = Math.max(radius, 12 * u); // cantos arredondados sempre, para os dois cards combinarem
      return {
        screen: round({ x: x0, y: y0, w: sw, h, radius: r }),
        cam: round({ x: x0 + sw + gap, y: y0, w: cw, h, radius: r, shape: 'rect' }),
      };
    }

    default:
      throw new Error(`Layout desconhecido: ${id}`);
  }
}

// Versão vertical (9:16) para celular: empilha tela em cima e câmera embaixo, tudo centralizado.
export function computeVerticalLayout(id, { width: W, height: H, shape = 'circle', screenAspect = 16 / 9 }) {
  const pad = W * 0.06;
  const gap = W * 0.04;
  const radius = W * 0.03;
  const area = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };
  const screenH = area.w / screenAspect;
  const camMax = H * 0.4; // a câmera nunca passa de 40% da altura do quadro

  switch (id) {
    case 'screen':
      return { screen: round({ ...fit(screenAspect, area), radius }), cam: null };

    case 'cam':
      // Só a câmera: ocupa o quadro todo, com a margem que deixa o fundo e a borda aparecendo.
      // (O limite de 40% vale quando a câmera divide o quadro com a tela.)
      return { screen: null, cam: round({ ...area, radius, shape: 'rect' }) };

    case 'bubble': {
      // Bolha grande, centralizada abaixo da tela.
      const d = Math.min(area.w * 0.62, area.h - screenH - gap, camMax);
      const total = screenH + gap + d;
      const y0 = area.y + (area.h - total) / 2;
      const cx = area.x + (area.w - d) / 2;
      const cam =
        shape === 'square'
          ? { x: cx, y: y0 + screenH + gap, w: d, h: d, radius: d * 0.18, shape: 'rect' }
          : { x: cx, y: y0 + screenH + gap, w: d, h: d, radius: d / 2, shape: 'circle' };
      return { screen: round({ x: area.x, y: y0, w: area.w, h: screenH, radius }), cam: round(cam) };
    }

    case 'split': {
      // Câmera ocupa a largura toda embaixo da tela.
      const camH = Math.min(area.w * 1.1, area.h - screenH - gap, camMax);
      const total = screenH + gap + camH;
      const y0 = area.y + (area.h - total) / 2;
      return {
        screen: round({ x: area.x, y: y0, w: area.w, h: screenH, radius }),
        cam: round({ x: area.x, y: y0 + screenH + gap, w: area.w, h: camH, radius, shape: 'rect' }),
      };
    }

    default:
      throw new Error(`Layout desconhecido: ${id}`);
  }
}
