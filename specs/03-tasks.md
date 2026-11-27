# Tarefas: Easy Recorder (v1)

> Fase 3 do SDD. Cada tarefa é pequena, testável e aponta para a spec.

| # | Tarefa | Cobre | Pronto quando |
|---|--------|-------|---------------|
| T01 ✅ | Criar `index.html` com Tailwind, tema escuro e a grade preview + painel | RNF01, RNF06 | Página abre em localhost sem erros no console |
| T02 | `state.js` com o estado e a máquina de estados | seção 7 | Transições inválidas são ignoradas |
| T03 | `media.js`: compartilhar tela, câmera, microfone, listar dispositivos, detectar suporte | RF02–RF04, CA09, CA11 | Cada fonte aparece num `<video>` de teste; cancelar não quebra |
| T04 | `layouts.js` com L1–L4, cantos e tamanhos da bolha | RF01, seção 4 | Retângulos certos para os 4 layouts, com e sem fundo |
| T05 | `compositor.js`: laço de desenho no canvas 1280×720 | RF05, RF10, RNF04 | Preview mostra o layout escolhido ao vivo |
| T06 | `background.js`: cor, imagem, vídeo, tratamento de erro | 4.1, RF05b, CA12–CA14 | Os três tipos de fundo aparecem no preview |
| T07 | Painel de opções: miniaturas de layout, canto/tamanho da bolha, fundo, dispositivos | RF01, RF04, CA02 | Mudar opção atualiza o preview na hora |
| T08 | Mixagem de áudio (mic + aba) e medidor de nível | RF04, RF04b, RF04c, CA07, CA15 | Medidor ou gravação de teste capta os dois |
| T09 | `recorder.js`: contagem 3-2-1, gravar, pausar, retomar, parar, cronômetro | RF06–RF09, CA03–CA05 | Pausa de 5 s não aparece no vídeo |
| T10 | Tela final: player, Baixar com nome padrão, Nova gravação, liberar dispositivos | RF11–RF13, RNF05, CA06, CA10 | Arquivo baixado toca e a luz da câmera apaga |
| T11 | Mensagens de erro: câmera negada, sem suporte, arquivo inválido | CA08, CA11, CA14 | Cada caso mostra aviso em português |
| T12 | Validação manual CA01–CA14 em Chrome e Firefox, registrar em `04-validacao.md` | todos | Todos os CA marcados ou com bug anotado |

| T13 | Highlights por intensidade de voz: anotar níveis, detectar picos, gerar MP4 com progresso | RF19, CA28, CA29 | Botão gera e baixa um MP4 curto com os picos |

Ordem sugerida: T01 → T02 → T03 → T04 → T05 → T07 → T06 → T08 → T09 → T10 → T11 → T12.
