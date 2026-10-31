# Registro de decisões

Formato curto de ADR (Architecture Decision Record). Status possíveis:

- **Aceita**: decidida, implementar assim.
- **Proposta**: sugerida, aguardando confirmação.
- **Substituída**: trocada por outra decisão (indicar qual).

---

## D-001 — Envolver o CLI `claude` em vez de usar API ou SDK
**Status:** Aceita · **Data:** 2026-10-31

**Contexto.** O plano de assinatura só pode ser usado pela TUI do Claude Code ou pela web. Clientes de terceiros (ex.: OpenCode) exigem API key, que é cobrada à parte.

**Decisão.** O app executa o binário `claude` instalado localmente. Ele nunca chama a API da Anthropic diretamente.

**Consequências.**
- Usa o login e os limites do plano, sem custo extra.
- Uso pessoal está dentro dos termos. **Não distribuir** o app como produto que ofereça login do claude.ai a terceiros.
- O app depende do CLI estar instalado e logado (`claude` no PATH).

---

## D-002 — Electron como plataforma desktop
**Status:** Aceita · **Data:** 2026-10-31

**Alternativas avaliadas.**

| Opção | RAM ociosa (aprox.) | Motivo de não escolher |
|---|---|---|
| Tauri 2 | 40–80 MB | O WebKitGTK no Linux é menos estável com o xterm.js. Exige Rust e `webkit2gtk-4.1`, que não estão instalados. |
| GTK4 + VTE | 30–50 MB | O layout do mockup teria que ser refeito em GTK. Só funciona no Linux. |
| **Electron** | 150–300 MB | Escolhido |

**Por quê.** Cada processo `claude` usa ~330–350 MB (medido). Com 4 sessões, a diferença de casca entre Electron e Tauri é só ~10% do total. Em troca, o Electron tem o terminal embutido mais testado que existe (xterm.js + node-pty, o mesmo do VS Code), aproveita o HTML do mockup e o Node já está instalado.

**Consequências.** O pacote final fica com ~100 MB em disco. O frontend é HTML/CSS/JS, então migrar para Tauri depois só exigiria trocar o backend.

---

## D-003 — Painel direito mostra a TUI real (xterm.js + node-pty)
**Status:** Aceita · **Data:** 2026-10-31

**Contexto.** Também era possível renderizar o chat com componentes próprios, usando o modo `--output-format stream-json`.

**Decisão.** Cada terminal é um pseudo-terminal (node-pty) rodando `claude`, exibido com xterm.js. O app só cuida da navegação **em volta** do terminal.

**Por quê.** Permissões, slash commands, plan mode, diffs e atalhos continuam funcionando sem reimplementação, e cada atualização do Claude Code chega automaticamente.

**Consequências.** O visual dentro do painel continua sendo o da TUI. O texto estilizado do mockup era só ilustrativo.

---

## D-004 — Dados do Claude são só lidos, nunca escritos
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.** O app lê `~/.claude/sessions/` e `~/.claude/projects/`, mas nunca grava nem apaga nada lá. O estado próprio do app fica em `~/.config/conductor/`.

**Por quê.** São formatos internos e não documentados. Escrever neles poderia corromper sessões.

**Consequências.**
- Todo o parsing fica isolado em um módulo (`src/main/claude-data/`, com os tipos em `types.ts`), para que uma mudança de formato afete um só lugar.
- O parsing deve tolerar campos ausentes, sem quebrar a interface.

---

## D-005 — Uso do plano e do contexto via status line injetada com `--settings`
**Status:** Aceita · **Data:** 2026-10-31

**Contexto.** O único lugar onde o CLI expõe `rate_limits` (5h e semanal) e o contexto atual é o JSON que ele envia ao comando de status line.

**Decisão.** Ao abrir cada terminal, o app passa `--settings '<json>'` com um `statusLine` que aponta para um script do próprio app. O script:
1. lê o JSON da entrada padrão;
2. grava o JSON em `~/.config/conductor/state/<session_id>.json` (escrita atômica);
3. imprime uma linha curta, para que a status line continue aparecendo na TUI.

**Por quê.** Não altera o `~/.claude/settings.json` global e só vale para as sessões abertas pelo app.

**Consequências.**
- Os números só atualizam enquanto há sessão ativa. Com tudo fechado, o rodapé mostra o último valor e o horário em que foi lido.
- Se o usuário configurar uma status line própria no futuro, o script do app precisa chamá-la em cadeia. Fica para depois.

---

## D-006 — Rodapé de uso: remover "mensal" e renomear "total"
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.**
- "Uso mensal" sai: os planos não têm limite mensal.
- "Uso total" passa a ser **"Sessão (5h)"**.
- "Uso semanal" continua.
- O plano Pro não informa o semanal por modelo (`seven_day_opus` / `seven_day_sonnet`), como mostrou a fase 0. Por isso o terceiro card vira um **resumo dos terminais**: contagem de executando / aguardando / precisa de você, com as mesmas cores das bolinhas (D-012). Resolve a Q-5.

---

## D-007 — Atalhos de teclado
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.**

| Atalho | Ação |
|---|---|
| `Ctrl+Tab` | Próximo terminal ativo (`Ctrl+Shift+Tab`: anterior) |
| `Ctrl+Shift+T` | Novo terminal |
| `Ctrl+Shift+W` | Fechar terminal atual (com o diálogo de confirmação) |

Não há atalho para ir direto a um terminal específico. O ⌘K do mockup sai.

**Regra.** O app não captura atalhos que o Claude já usa. Por isso `Ctrl+T` (lista de tarefas no Claude) e `Ctrl+W` (apagar palavra) ficaram com `Shift`. Conferido no Claude Code 2.1.316: `Ctrl+Tab`, `Ctrl+Shift+Tab`, `Ctrl+Shift+T` e `Ctrl+Shift+W` não têm uso nele.

**Atenção para fases futuras.** O Claude usa `Ctrl+Shift+B` (resumo) e `Ctrl+Shift+C` (copiar seleção). O app não deve capturar esses atalhos.

---

## D-008 — Stack do código
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.**
- **TypeScript + Vite**, com `electron-vite`, que compila separadamente o main, o preload e o renderer.
- Sem framework de UI no renderer: TypeScript com DOM direto, portando o JS do mockup. Dá para reavaliar se a interface crescer.
- O DOM é montado com um helper (`el()`) e `textContent`, **nunca `innerHTML`**: títulos e caminhos vêm de arquivos do Claude e do usuário.
- Fontes (DM Sans / DM Mono) empacotadas via `@fontsource`, sem depender de internet. CSP restrita a `'self'`.
- Versões fixadas na fase 1: Electron 45.2.1, electron-vite 6.0.0, Vite 8.3.5, TypeScript 7.0.2.
- Os tipos do contrato IPC ficam em `src/shared/`, compartilhados entre main, preload e renderer.
- `node-pty` recompilado para o Electron com `@electron/rebuild`.
- `@xterm/xterm` com os addons `fit` e `webgl`.
- Empacotamento com `electron-builder` (AppImage e .deb).
- Segurança: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. O renderer só acessa o que o preload expõe via `contextBridge`.

**Por quê.** Os formatos lidos de `~/.claude/` não são documentados. Ter tipos explícitos para eles e para o IPC deixa as quebras de versão visíveis na compilação, não só em tempo de execução.

---

## D-009 — Identificação de sessões novas com `--session-id`
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.** Ao criar um terminal, o app gera um UUID e inicia `claude --session-id <uuid> --name <nome>`.

**Por quê.** O app sabe o ID da sessão desde o início e consegue cruzar os dados com `~/.claude/sessions/`, o `.jsonl` e o estado da status line, sem precisar adivinhar.

---

## D-010 — Sessões abertas fora do app
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.** Sessões do `claude` iniciadas fora do app (em outro terminal) **não aparecem** em "Terminais ativos". Elas só aparecem no histórico, porque também gravam `.jsonl`.

**Consequência importante.** Retomar uma sessão que ainda está aberta em outro lugar faria dois processos escreverem na mesma conversa. Por isso, no histórico, uma sessão cujo `sessionId` está em `~/.claude/sessions/` (ou seja, em execução fora do app) aparece com a tag **"em uso"** e não pode ser retomada até ser fechada.

---

## D-011 — Sem restauração automática ao reabrir o app
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.** Ao fechar o app, todos os terminais são encerrados. Ao reabrir, a lista de ativos começa vazia e as sessões anteriores ficam no histórico.

**Detalhe.** Se houver algum terminal executando (`busy`) ao fechar a janela, o app pede confirmação antes de encerrar, reaproveitando o estilo do diálogo de "Fechar terminal".

---

## D-012 — Aviso "precisa de você"
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.** Uma terceira cor para a mesma bolinha de status ao lado do nome do terminal:

| Cor | Estado | Origem |
|---|---|---|
| Verde | executando | `status: "busy"` |
| Amarelo | aguardando um prompt | `status: "idle"` |
| **Nova cor (ex.: laranja/vermelho, com pulso)** | **precisa de você**: pedido de permissão pendente | `status: "waiting"` |

**Como (revisado após a fase 0).** O próprio registro de sessões (`~/.claude/sessions/<pid>.json`) muda para `status: "waiting"` em ~1 s quando o Claude pede permissão e volta para `busy` quando o usuário responde. O hook `Notification`, previsto antes, só dispara 6 s depois. Por isso **não usamos hook**: o app só observa o registro, que já é usado para verde/amarelo.

Status desconhecidos (ex.: `requires_action`) são tratados como "aguardando".

---

## D-013 — Histórico só retoma
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.** A única ação do histórico é **Retomar** (clique na linha → `claude --resume <id>` no `cwd` original). Não haverá fork, renomear nem apagar.

---

## D-014 — Teclado e área de transferência no terminal
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.**
- O menu padrão do Electron é removido (`Menu.setApplicationMenu(null)`), porque ele capturava `Ctrl+W`, `Ctrl+R` e `Ctrl+C`. Em desenvolvimento, `F12` abre as DevTools.
- `Ctrl+Shift+C` copia a seleção do xterm e `Ctrl+Shift+V` cola texto (com *bracketed paste*), no padrão dos terminais Linux.
- `Ctrl+C` e `Ctrl+V` vão direto para o Claude: interromper e colar imagem.
- O Chromium só tem permissão de área de transferência (`clipboard-read` e `clipboard-sanitized-write`); todas as outras são negadas.

**Observação.** Se a TUI ativar o modo mouse, a seleção com o mouse no xterm passa a exigir `Shift` + arrastar. Isso é comportamento padrão de terminal.

---

## D-015 — Ambiente do `claude` filho
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.** O `claude` de cada terminal herda o ambiente do app, menos as variáveis do Electron/Vite, do próprio app (`CONDUCTOR_*`) e as que uma sessão do Claude Code define para os processos dela (`CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_MESSAGING_*` etc.). `TERM=xterm-256color` e `COLORTERM=truecolor` são fixados.

**Por quê.** Se o app fosse aberto de dentro de uma sessão do Claude Code, o `claude` filho se acharia uma subsessão dela.

**Binário.** É procurado no `PATH` e, depois, em `~/.local/bin/claude` e `~/.claude/local/claude`. Aberto pelo menu do sistema, o app herda um PATH reduzido.

---

## D-016 — Fonte de símbolos para a TUI
**Status:** Aceita · **Data:** 2026-10-31

**Decisão.** O xterm usa `"DM Mono", "Noto Sans Symbols 2", "DejaVu Sans Mono", monospace`. O DM Mono não tem símbolos que a TUI usa (ex.: `⏵⏵` do "auto mode"), e nenhuma fonte instalada no sistema tinha. A Noto Sans Symbols 2 vai empacotada (`@fontsource`). Caracteres de desenho de caixa são desenhados pelo próprio xterm (glifos customizados do WebGL).

---

## Em aberto

Nenhuma questão em aberto no momento.
