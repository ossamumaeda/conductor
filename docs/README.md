# Conductor — documentação

Conductor é um app desktop (Linux) que organiza várias sessões do **Claude Code** em uma interface gráfica: lista de terminais ativos, histórico com retomada em um clique e painel de uso do plano.

O app **não substitui** o Claude Code. Ele roda o binário `claude` oficial dentro de terminais embutidos, então usa o login da assinatura (Pro/Max) e todos os recursos da TUI continuam funcionando.

## Documentos

| Documento | Conteúdo |
|---|---|
| [decisoes.md](decisoes.md) | Registro das decisões tomadas (e das ainda em aberto), com o porquê de cada uma |
| [arquitetura.md](arquitetura.md) | Processos, módulos, comunicação entre eles e estrutura de pastas |
| [fontes-de-dados.md](fontes-de-dados.md) | De onde vem cada informação exibida na tela, com os campos exatos |
| [roadmap.md](roadmap.md) | Fases de implementação, com checklist e critério de pronto |

## Como rodar

```bash
npm install
npx electron --version   # na primeira vez: baixa o binário do Electron
npm run dev              # desenvolvimento, com hot reload
npm run typecheck        # checagem de tipos (main/preload e renderer)
npm run build            # build de produção em out/
```

Para verificação visual automatizada: `CONDUCTOR_CAPTURE=/caminho/print.png npx electron-vite preview` salva um print da janela e fecha o app.

## Referências

- Mockup visual: [`../index.html`](../index.html). Fica como referência do layout e não é alterado pela implementação.
- Versão do Claude Code usada na análise: **2.1.316**.

## Como manter estes docs

- Toda decisão nova ou alterada entra em `decisoes.md` antes (ou junto) do código.
- Ao concluir uma fase, marque o checklist em `roadmap.md`.
- Se uma atualização do Claude Code mudar algum formato de arquivo, atualize `fontes-de-dados.md` com a nova versão testada.
