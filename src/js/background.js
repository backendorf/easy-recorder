// Fundo atrás dos cards: nenhum, cor ou arquivo (imagem/vídeo). Spec, seção 4.1.
import { coverSource } from './compositor.js';

export class Background {
  mode = 'color';
  color = '#6d5dfc';
  el = null;
  url = null;

  get active() {
    return this.mode === 'color' || (this.mode === 'file' && !!this.el);
  }

  async setFile(file) {
    const isImage = /^image\/(png|jpeg|webp)$/.test(file.type);
    const isVideo = /^video\/(mp4|webm)$/.test(file.type);
    if (!isImage && !isVideo) throw new Error('Use uma imagem JPG, PNG ou WebP, ou um vídeo MP4 ou WebM.');
    const url = URL.createObjectURL(file);
    try {
      const el = isImage ? await loadImage(url) : await loadVideo(url);
      this.release();
      this.el = el;
      this.url = url;
    } catch {
      URL.revokeObjectURL(url);
      throw new Error('Não foi possível abrir esse arquivo.');
    }
  }

  release() {
    if (this.el instanceof HTMLVideoElement) {
      this.el.pause();
      this.el.remove();
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.el = null;
    this.url = null;
  }

  draw(ctx, W, H) {
    if (this.mode === 'color') {
      ctx.fillStyle = this.color;
      ctx.fillRect(0, 0, W, H);
    } else if (this.mode === 'file' && this.el) {
      // Sempre "cover": escala para cobrir o quadro inteiro e corta o excesso pelo centro.
      const sw = this.el.naturalWidth || this.el.videoWidth;
      const sh = this.el.naturalHeight || this.el.videoHeight;
      if (!sw || !sh) return;
      const c = coverSource(sw, sh, W, H);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.el, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H);
    }
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    Object.assign(v, { muted: true, loop: true, playsInline: true, src: url });
    v.onloadeddata = () => v.play().then(() => resolve(v), () => resolve(v));
    v.onerror = reject;
    // No DOM para o navegador não pausar o vídeo fora da tela.
    document.getElementById('hidden-sources').append(v);
  });
}
