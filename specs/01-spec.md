# Especificação: Easy Recorder (v1)

> Fase 1 do SDD. Descreve **o quê** e **por quê**, sem decidir **como**.
> Status: rascunho v3 (webcam, layouts e fundo personalizado), aguardando confirmação.

## 1. Visão

Um app web de página única para gravar tela, webcam e microfone direto no navegador, no estilo dos gravadores de vídeo-mensagem: escolher um layout, gravar, ver o resultado e baixar. Sem login, sem servidor, sem instalação: abrir o `index.html` e usar. O app se chama **Easy Recorder**; visual próprio, sem copiar marca de terceiros.

## 2. Público e cenário de uso

Qualquer pessoa que precise gravar rapidamente um tutorial, uma explicação com o rosto aparecendo, um bug ou uma demonstração e mandar o arquivo para alguém.

## 3. Escopo

### Dentro (v1)
- Escolher um **layout** antes de gravar (ver seção 4).
- Escolher a fonte da tela (tela inteira, janela ou aba) pelo seletor nativo do navegador.
- Escolher câmera e microfone quando houver mais de um.
- Pré-visualização ao vivo do layout antes e durante a gravação.
- **Fundo personalizado**: cor, imagem ou vídeo atrás da tela e da câmera (ver seção 4.1).
- Contagem regressiva de 3 s antes de começar.
- Iniciar, pausar, retomar e parar.
- Cronômetro do tempo gravado.
- Pré-visualização do vídeo final, baixar (`.mp4`) e descartar.

### Fora (v1)
- Edição de vídeo (cortar, legendas).
- Seletor de qualidade (sempre a máxima).
- Upload ou compartilhamento por link.
- Efeitos na webcam (desfoque ou troca do fundo atrás da pessoa, filtros).
- Histórico de gravações salvo entre sessões (as preferências são salvas, os vídeos não).

## 4. Layouts

| ID | Layout | Descrição |
|----|--------|-----------|
| L1 | Só tela | A tela ocupa o vídeo inteiro. |
| L2 | Tela + webcam em bolha | Tela inteira com a webcam num círculo num canto. |
| L3 | Só webcam | A webcam ocupa o vídeo inteiro. |
| L4 | Lado a lado | Tela e webcam divididas lado a lado. |

Para o L2, o usuário escolhe o canto da bolha (4 cantos), o tamanho (P, M, G) e o formato (redondo ou quadrado com cantos arredondados).

Para o L4, um controle deslizante ajusta a proporção entre tela e câmera (de 50/50 a 80/20, padrão 70/30). Em qualquer valor, os dois cards mantêm a mesma altura, o mesmo espaço entre eles e o conjunto fica centralizado.

Em todos os layouts com câmera, há a opção **Zoom suave em loop** (desligada por padrão): a imagem da câmera aproxima e afasta em loop dentro do card. Com o zoom ligado aparecem a intensidade (5% a 30%, padrão 15%) e a velocidade (Lento 12 s, Normal 8 s, Rápido 4,5 s por ciclo), sem mudar o tamanho do card. O efeito aparece no preview e no vídeo.

Em todos os layouts com câmera, o usuário escolhe a borda da câmera: sem borda, fina ou grossa (branca).

### 4.1 Fundo

Em todos os layouts, a tela e a câmera ficam com uma margem e cantos arredondados sobre um fundo, como uma moldura. O fundo pode ser:

- **Nenhum**: sem margem, conteúdo ocupando o vídeo todo (padrão).
- **Cor sólida**: escolhida num seletor de cor.
- **Imagem**: arquivo do computador (JPG, PNG, WebP).
- **Vídeo**: arquivo do computador (MP4, WebM), sem som, em loop.

Imagem e vídeo sempre preenchem o fundo inteiro (modo *cover*: escala e corte centralizado, sem faixas nem distorção), em qualquer layout e resolução. O preview segue a proporção do vídeo final, para não mostrar faixas em volta.

Os arquivos de fundo são lidos localmente e não saem da máquina.

## 5. Requisitos funcionais

| ID | Requisito |
|----|-----------|
| RF01 | O usuário escolhe um dos layouts L1–L4; o padrão é L2. |
| RF02 | Layouts com tela (L1, L2, L4) abrem o seletor nativo de tela/janela/aba. |
| RF03 | Layouts com webcam (L2, L3, L4) pedem acesso à câmera e mostram a imagem ao vivo. |
| RF04 | O usuário pode ligar/desligar o microfone e escolher o dispositivo. |
| RF04c | Um medidor mostra o nível do microfone em tempo real, antes e durante a gravação. |
| RF04b | Em layouts com tela, o usuário pode incluir o áudio da aba/sistema quando o navegador oferecer. |
| RF05 | Antes de gravar, a área de preview mostra o resultado como ficará no vídeo. |
| RF05b | O usuário escolhe o fundo (nenhum, cor, imagem ou vídeo) e o preview mostra o resultado. |
| RF06 | Ao clicar em **Gravar**, aparece uma contagem 3-2-1 e então a gravação começa. |
| RF07 | Durante a gravação, o app mostra um indicador "Gravando" e um cronômetro (mm:ss). |
| RF08 | O usuário pode **Pausar** e **Retomar**; o cronômetro não conta enquanto pausado. |
| RF09 | O usuário pode **Parar**. |
| RF17 | Durante a gravação, um botão no dock começa ou para o compartilhamento de tela sem interromper a gravação. Ao parar (pelo botão ou pela barra do navegador), o layout desliza para "Só câmera"; ao compartilhar de novo, volta ao layout anterior. O áudio da nova aba entra na gravação. |
| RF10 | O vídeo final reproduz exatamente o layout escolhido (tela e câmera no mesmo vídeo). |
| RF11 | Ao parar, o vídeo aparece num player para revisão. |
| RF12 | **Baixar** salva sempre em MP4 (H.264 + AAC): `easy-recorder-AAAA-MM-DD-HHMMSS.mp4`. |
| RF14 | Se houver vídeo gravado e não baixado, o navegador pede confirmação antes de fechar ou recarregar a aba. |
| RF15 | Opção **Gerar versão para celular (9:16)**, ligada por padrão. Com ela, o app grava ao mesmo tempo um segundo vídeo vertical 1080×1920, com a tela em cima, a câmera embaixo (nunca mais que 40% da altura do quadro) e o mesmo fundo, e no final mostra o botão **Celular** para baixá-lo (`...-celular.mp4`). |
| RF16 | Durante a gravação (ou pausado), os 4 layouts continuam no dock e podem ser trocados; a transição animada sai no vídeo normal e no de celular. Layouts com tela ficam indisponíveis se nenhuma tela foi compartilhada. A câmera fica ligada até o fim da gravação. |
| RF18 | As preferências ficam salvas no navegador e voltam ao abrir o app: layout, opções da câmera (formato, borda, bolha, zoom), proporção, fundo (incluindo a imagem ou vídeo escolhido), microfone, áudio da aba, versão para celular e dispositivos escolhidos. Tudo fica local (localStorage e IndexedDB). |
| RF19 | **Highlights**: ao fim, um painel abaixo do player reúne as opções (formato Desktop ou Celular, segundos antes e depois, sensibilidade) e o botão Gerar, que gera um MP4 extra (`...-highlights.mp4`) com os trechos em que a voz ficou mais intensa. O app anota o nível do microfone durante a gravação (~10x/s), acha picos bem acima do normal, pega alguns segundos antes e depois de cada pico (ajustável no painel, de 1 a 10 s; padrão 3 s antes e 4 s depois, salvo com as preferências), junta trechos próximos e fica com os mais fortes até 30 s no total, em ordem cronológica, com fade curto entre eles. A geração leva o tempo dos trechos e mostra o progresso. A referência é o seu tom normal naquela gravação, medido só nos momentos com voz; a **sensibilidade** (Baixa, Média, Alta) define o quanto acima dele conta como pico. Se nenhum trecho passar, usa os 3 momentos mais altos. Mostra quantos destaques achou. Só avisa "sem destaques" quando não há voz. O microfone é captado sem ganho automático, para não achatar os picos. Tudo local. |
| RF20 | Na tela final, cada saída (Desktop, Celular, Highlights e Highlights celular, conforme existirem) aparece como um botão com **▶ preview**, que mostra o vídeo no player do app, e **↓ download**. Gerar highlights adiciona a saída nova e já a mostra no player. Highlights de formatos diferentes podem coexistir; mudar antes/depois/sensibilidade descarta os gerados. |
| RF21 | Opção **Trocar sozinho** (desligada por padrão). Gravando com ela ligada: enquanto a aba do app está visível e em foco, o vídeo mostra só a câmera; ao trocar de aba, janela ou app, muda sozinho, com transição, para o layout escolhido nos botões, e volta para só a câmera ao retornar. O layout escolhido não muda (os botões continuam mostrando a escolha, e trocar de layout gravando muda o que aparece fora da aba). Exige compartilhar a tela ao começar (o navegador só permite pedir a tela com um clique); para pegar outros apps, é preciso escolher "Tela inteira". |
| RF22 | **Minibar flutuante**: ao clicar em Gravar, abre uma janelinha sempre por cima de qualquer app (Document Picture-in-Picture) com indicador, cronômetro, Pausar/Retomar e Parar. Fecha sozinha ao terminar. Se não abrir sozinha (o navegador exige um clique, e o seletor de tela pode consumir esse clique), um botão no dock abre a minibar. Só no Chrome e Edge; nos outros navegadores o app grava normalmente sem ela. Clicar nela não ativa o "Trocar sozinho". |
| RF13 | **Nova gravação** descarta o vídeo e volta à escolha de layout. |

## 6. Requisitos não funcionais

| ID | Requisito |
|----|-----------|
| RNF01 | Só HTML, JavaScript puro e Tailwind (via CDN). Sem build, sem framework. |
| RNF02 | Funciona nas versões atuais de Chrome, Edge e Safari no desktop (navegadores que gravam MP4). Em navegadores sem MP4 (ex.: Firefox), o app avisa e desativa o Gravar. |
| RNF03 | Nada sai da máquina do usuário; o vídeo fica na memória do navegador até ser baixado. |
| RNF04 | Qualidade sempre máxima: o vídeo sai na resolução nativa da fonte principal (tela, ou câmera no layout "Só câmera"), limitada a 4K, a 30 fps e com bitrate alto. Sem seletor de qualidade. |
| RNF05 | Ao terminar ou descartar, câmera, microfone e compartilhamento são desligados (a luz da câmera apaga). |
| RNF07 | Transições suaves (~300 ms) ao trocar layout, formato, borda, canto, tamanho, proporção e fundo, no preview (e no vídeo, se ocorrerem durante a gravação). A interface também anima entradas e saídas de forma sutil e respeita "reduzir movimento" do sistema. |
| RNF06 | Layout responsivo e utilizável por teclado; textos em português. |

## 7. Estados da interface

`configurando` → `contagem` → `gravando` ⇄ `pausado` → `finalizado` → (`configurando` via Nova gravação)

## 8. Critérios de aceite

- **CA01** Dado o layout L2, quando compartilho uma aba e permito a câmera, então o preview mostra a aba com minha webcam numa bolha no canto escolhido.
- **CA02** Dado o layout L2, quando mudo o canto ou o tamanho da bolha, então o preview atualiza na hora.
- **CA03** Dado qualquer layout, quando clico em Gravar, então vejo 3-2-1 e o cronômetro começa em 00:00.
- **CA04** Dado que estou gravando, quando pauso por 5 s e retomo, então o vídeo final não inclui esses 5 s.
- **CA05** Dado que estou gravando um layout com tela, quando paro o compartilhamento (pelo botão do dock ou pela barra do navegador), então a gravação continua e o layout vai suavemente para "Só câmera"; quando compartilho de novo, volta ao layout anterior.
- **CA06** Dado o estado finalizado, quando clico em Baixar, então o `.mp4` salvo toca num player comum e mostra o mesmo layout do preview.
- **CA07** Dado o microfone ligado, quando gravo falando, então o vídeo tem o áudio do microfone.
- **CA08** Dado um layout com webcam e a câmera negada, então o app avisa e sugere o layout "Só tela".
- **CA09** Dado o seletor de tela cancelado, então o app volta à configuração sem erro.
- **CA10** Dado o estado finalizado, quando clico em Nova gravação, então o player some e a luz da câmera apaga até eu configurar de novo.
- **CA11** Dado um navegador sem suporte (ex.: celular), então o app explica e desativa os layouts com tela.
- **CA15** Dado o microfone ligado, quando falo, então o medidor de nível se move; quando fico em silêncio, ele volta ao mínimo.
- **CA16** Dado um vídeo finalizado e não baixado, quando tento fechar ou recarregar a aba, então o navegador pede confirmação; depois de baixar, fecha sem perguntar.
- **CA18** Dado o layout L2, quando escolho "Quadrado", então a câmera vira um quadrado de cantos arredondados no preview e no vídeo.
- **CA19** Dado um layout com câmera, quando escolho borda "Grossa", então a câmera ganha uma borda branca mais larga; com "Sem borda", a borda some.
- **CA20** Dado um navegador que não grava MP4, então o app mostra o aviso e o botão Gravar fica desativado.
- **CA21** Dado o layout L4, quando arrasto o controle de proporção, então a largura da tela e da câmera muda ao vivo, com alturas iguais e o conjunto centralizado.
- **CA22** Dado o preview, quando troco de layout ou mudo formato, borda, canto, tamanho, proporção ou fundo, então os elementos deslizam e se transformam suavemente até a nova posição, sem saltos.
- **CA23** Dado o zoom suave ligado, então a imagem da câmera aproxima e afasta devagar em loop, no preview e no vídeo baixado, e o card continua do mesmo tamanho; ao desligar, a imagem volta ao normal suavemente.
- **CA24** Dado o zoom ligado, quando arrasto a intensidade ou troco a velocidade, então o efeito muda ao vivo, sem salto.
- **CA25** Dado a versão para celular ligada, quando paro a gravação, então aparecem os botões Baixar e Celular; o arquivo do Celular é um MP4 vertical 9:16 com o mesmo áudio, a mesma duração e as mesmas pausas.
- **CA26** Dado que estou gravando em "Tela + câmera", quando clico em "Lado a lado" e depois em "Só tela", então o vídeo final (e o de celular) mostra as transições suaves entre os três, sem cortes nem travamentos, e voltar para um layout com câmera funciona.
- **CA27** Dado que escolhi layout, fundo com imagem, borda grossa e zoom, quando fecho e abro o app de novo, então tudo volta como estava, inclusive a imagem de fundo.
- **CA28** Dado uma gravação com falas mais fortes em alguns momentos, quando clico em Highlights, então vejo o progresso e depois baixo um MP4 de até 30 s com esses momentos, com áudio.
- **CA29** Dado uma gravação sem voz (silêncio ou microfone desligado), quando clico em Highlights, então o app avisa. Com voz, sempre gera ao menos um destaque e informa quantos.
- **CA30** Dado que gravei com a versão celular ligada, quando escolho Celular no painel de highlights e gero, então o arquivo `...-celular-highlights.mp4` é vertical 9:16. Com a versão celular desligada, a opção Celular fica desativada e explica o motivo.
- **CA31** Dado o estado finalizado com versão celular e highlights gerados nos dois formatos, então vejo quatro saídas; clicar em ▶ de qualquer uma troca o vídeo no player e clicar em ↓ baixa o arquivo certo.
- **CA32** Dado "Trocar sozinho" ligado e a tela inteira compartilhada, quando começo a gravar nesta aba, então o vídeo mostra só a câmera; quando vou para outra aba ou app, o vídeo passa para tela + câmera em ~0,3 s; quando volto, retorna para só câmera.
- **CA33** Dado o Chrome, quando começo a gravar e vou para outro app, então a minibar continua visível por cima; Pausar/Retomar e Parar nela funcionam e o cronômetro acompanha.
- **CA12** Dado o fundo "Imagem" e um arquivo PNG escolhido, então o preview e o vídeo final mostram a imagem em volta da tela e da câmera.
- **CA13** Dado o fundo "Vídeo", então o vídeo de fundo roda em loop, sem som, durante toda a gravação.
- **CA14** Dado um arquivo de fundo inválido, então o app avisa e mantém o fundo anterior.

## 9. Decisões

- O fundo é a moldura atrás dos cards de tela e câmera, não um fundo virtual da webcam (confirmado pelo Davi).
- Áudio da aba/sistema: opção desligada por padrão, ativável quando o navegador suportar (padrão provisório).
- Visual: tema escuro e minimalista. Nome: **Easy Recorder** (confirmado pelo Davi).

## 10. Perguntas em aberto

1. Há algum layout do gravador de referência que não está na tabela da seção 4?
