# Plano técnico: Easy Recorder (v1)

> Fase 2 do SDD. Descreve **como** atender a [spec](01-spec.md).

## 1. Stack

- `index.html` + Tailwind v4 via CDN (`https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4`).
- JavaScript puro em módulos ES (`<script type="module">`), sem build.
- Precisa ser servido por `http://localhost` ou HTTPS, porque câmera e captura de tela exigem contexto seguro. Para rodar: `npx serve .` ou `python3 -m http.server`.

## 2. Estrutura de arquivos

```
screen-recorder/
├── index.html          # layout da página e controles
├── js/
│   ├── main.js         # liga a UI aos módulos, máquina de estados
│   ├── state.js        # estado único + eventos de mudança
│   ├── media.js        # getDisplayMedia, getUserMedia, lista de dispositivos
│   ├── compositor.js   # desenha tela, câmera e fundo num <canvas>
│   ├── layouts.js      # funções que calculam os retângulos de cada layout
│   ├── background.js   # cor / imagem / vídeo de fundo a partir de arquivo
│   ├── recorder.js     # MediaRecorder, pausa, cronômetro, Blob final
│   └── ui.js           # renderiza botões e painéis conforme o estado
└── specs/              # esta documentação
```

## 3. Arquitetura

```
 tela (getDisplayMedia) ─┐
 câmera (getUserMedia) ──┼─► <video> ocultos ─► compositor (canvas na resolução da fonte, 30 fps)
 fundo (img/video/cor) ──┘                              │
                                                        ▼
                                          canvas.captureStream(30) ─► trilha de vídeo
 microfone + áudio da aba ─► AudioContext (mixagem) ─► trilha de áudio
                                                        ▼
                                           MediaStream ─► MediaRecorder ─► Blob .mp4
```

- **Composição no canvas** (atende RF05, RF10, 4.1): o mesmo canvas serve de preview e de fonte da gravação, então o que se vê é o que se grava.
- **Qualidade máxima** (RNF04): a tela é pedida em até 3840×2160 e a câmera em até 1920×1080. O canvas assume a resolução nativa da fonte principal (largura e altura pares, máximo 4K). Bitrate calculado por pixel: cerca de 0,2 bit/pixel/quadro, entre 8 e 50 Mbps.
- **Laço de desenho**: `requestAnimationFrame` enquanto a aba está visível. Como o rAF para quando a aba fica em segundo plano (comum ao gravar outra aba), usamos um `setInterval` de 33 ms durante a gravação como garantia.
- **Layouts** (`layouts.js`): cada layout é uma função pura `(canvas, opções) → { screen: rect|null, cam: rect|null, camShape: 'circle'|'rounded' }`. Fácil de testar e de adicionar layouts novos.
  - Sem fundo: margem 0, cantos retos. Com fundo: margem de 48 px e cantos de 16 px.
  - A tela é desenhada em modo *contain* (sem cortar); a câmera em *cover* (corte central).
- **Áudio**: microfone e áudio da aba entram num `AudioContext` e saem num único `MediaStreamDestination`, porque o MediaRecorder grava mal com mais de uma trilha de áudio.
- **Formato**: sempre MP4 (H.264 High + AAC), escolhendo o primeiro perfil suportado via `MediaRecorder.isTypeSupported`. Sem MP4, o Gravar fica desativado com aviso.
- **Pausa** (RF08, CA04): `recorder.pause()/resume()`; o cronômetro soma só os intervalos ativos.
- **Fim pelo navegador** (RF09, CA05): ouvir `ended` na trilha de vídeo da tela.
- **Liberação** (RNF05): `track.stop()` em todas as trilhas e `URL.revokeObjectURL` nos blobs ao descartar.
- **Fundo** (`background.js`): `URL.createObjectURL(file)`; imagem via `<img>`, vídeo via `<video muted loop playsinline>`. Desenho em modo *cover*. Erro de carga mantém o fundo anterior (CA14).

- **Versão vertical** (RF15): um segundo `Compositor` desenha num canvas 1080×1920 com `computeVerticalLayout`, só durante a gravação, e um segundo `Recorder` grava esse canvas com uma cópia (`clone()`) da trilha de áudio mixada. Pausar, retomar e parar agem nos dois. Gravar em paralelo é a única forma de manter o layout certo, porque depois de gravado só existe o vídeo já montado. O custo é mais processamento durante a gravação.

- **Highlights** (RF19, `highlights.js`): um timer em Worker anota `{t: tempo gravado, v: nível do mic}` a cada 100 ms. `findHighlights` suaviza os níveis (~0,5 s), separa os momentos com voz (acima do ruído de fundo), usa como limiar a mediana da voz + sensibilidade × dispersão (p80−p20 da voz), pega o pico de cada região acima do limiar e monta trechos de −N s/+M s (padrão 3 e 4, ajustáveis), mesclados e limitados a 30 s. `renderHighlights` toca o MP4 final num `<video>` oculto, desenha num canvas (com fade de 250 ms) e grava canvas + áudio (via `MediaElementSource`) com o mesmo `Recorder`, pausando entre trechos. Leva o tempo real dos trechos.

## 4. Máquina de estados

| Estado | Entra quando | Botões visíveis |
|--------|--------------|-----------------|
| configurando | início / Nova gravação | layouts, fundo, dispositivos, Compartilhar tela, Gravar |
| contagem | clicou em Gravar | Cancelar |
| gravando | fim da contagem / Retomar | Pausar, Parar |
| pausado | Pausar | Retomar, Parar |
| finalizado | Parar / fim do compartilhamento | player, Baixar, Nova gravação |

## 5. Interface

- Tema escuro. Coluna esquerda com o preview grande (canvas 16:9); coluna direita com o painel de opções. Em telas estreitas, o painel vai para baixo.
- Seletor de layout com 4 miniaturas clicáveis (`role="radiogroup"`).
- Barra flutuante durante a gravação com ponto vermelho, cronômetro e botões.

## 6. Riscos

| Risco | Mitigação |
|-------|-----------|
| Firefox não captura áudio da aba | Esconder a opção quando a trilha de áudio não vier. |
| Gravar a própria aba do app cria "efeito espelho" | Aviso discreto no seletor; não bloquear. |
| Firefox não grava MP4 | Aviso e botão Gravar desativado. |
| Desempenho em 4K com vídeo de fundo + tela + câmera | Medir no Chrome; se travar, limitar a 1440p numa versão futura. |

## 7. Como validar

Checklist manual com os critérios CA01–CA14 da spec, em Chrome e Firefox, registrado em `specs/04-validacao.md`.

## 8. Publicação (Cloudflare Pages)

- Por decisão do Davi, por enquanto só a versão de **arquivo único**: `build.py` junta `index.html` + `js/*.js` em `easy-recorder.html` e na cópia `cloudflare-minimo/index.html`, que é o que vai para o Pages.
- A versão em vários arquivos (CSS compilado, `_headers` com CSP) ficou de lado; o script `build_deploy.py` continua no projeto caso ela volte.
