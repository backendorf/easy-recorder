# Easy Recorder: deploy no Cloudflare Pages

O site é um **arquivo único**: o `index.html` da raiz. Ele tem o app inteiro (HTML, CSS e JS) e usa o Tailwind pelo CDN.

## Publicar ou atualizar

1. No painel da Cloudflare, abra o projeto **easy-recorder** (Workers & Pages).
2. Crie um novo deploy e envie só o `index.html`.
3. Recarregue `https://easy-recorder.pages.dev`.

## Gerar o arquivo depois de mudar o código

O código-fonte fica em `src/` (`src/index.html` + `src/js/`). Depois de editar, rode na raiz: `python3 build.py`. Ele regera o `index.html`.
