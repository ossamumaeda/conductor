# Roadmap

Cada fase termina com algo **funcionando de ponta a ponta**. Só avançar quando o critério de pronto da fase estiver ok.

## Pré-requisitos
- [x] Node.js (v22 via nvm)
- [x] Claude Code instalado e logado
- [ ] Ferramentas de build para o `node-pty` (módulo nativo): `python3`, `make`, `g++` (`sudo apt install build-essential python3`)

---

## Fase 0 — Validação técnica ✅
Confirmar as hipóteses de `fontes-de-dados.md` antes de construir em cima delas. Scripts e capturas em `spikes/fase-0/`.

- [x] Script de status line que só despeja o JSON recebido em um arquivo. Rodar uma sessão com `--settings` e registrar o payload real em `fontes-de-dados.md`
- [x] Confirmar os valores possíveis de `status` em `sessions/<pid>.json`: existe também **`waiting`** (pedido de permissão)
- [x] Confirmar que `--session-id` + `--name` + `--settings` funcionam juntos numa sessão interativa
- [x] Compilar o `node-pty` para o Electron sem erro (Electron 45.2.1 + node-pty 1.1.0)
- [x] Capturar o payload real do hook `Notification`: dispara 6 s depois do pedido, então foi substituído pelo `status: waiting` (D-012 revisada)

**Resultado:** todas as hipóteses confirmadas. Mudanças: D-012 não usa mais hook, e o terceiro card do rodapé virou o resumo dos terminais (D-006).

## Fase 1 — Esqueleto ✅
- [x] Projeto `electron-vite` em TypeScript (main, preload, renderer), com os scripts `dev`, `build` e `typecheck`
- [x] Tipos do contrato IPC em `src/shared/ipc.ts`
- [x] Janela com o layout do mockup portado para `src/renderer/` (ainda com dados falsos)
- [x] Preload com `contextBridge` e configurações de segurança (D-008)

**Pronto quando:** `npm run dev` abre a janela com o visual idêntico ao mockup.

**Resultado:** visual conferido lado a lado com o mockup em 1400×880. Já aplicados: a cor "precisa de você" (D-012), o rodapé novo (D-006), a tag "em uso" (D-010) e a dica `Ctrl+Tab` (D-007). A ponte segura já funciona de ponta a ponta: o topo da sidebar mostra a versão real do `claude`.

## Fase 2 — Um terminal real ✅
- [x] `pty-manager` fazendo spawn do `claude` em um diretório fixo
- [x] xterm.js no painel direito, com os addons fit e webgl e as fontes do mockup
- [x] Redimensionamento correto ao mudar o tamanho da janela
- [x] Copiar/colar funcionando

**Pronto quando:** dá para conversar com o Claude dentro do app como na TUI normal, inclusive aprovando permissões.

**Resultado:** validado com o roteiro `scripts/e2e/fase-2.cjs`, que tira prints a cada passo. Funcionam: digitação, autocompletar de `/comandos`, `Ctrl+Shift+V`, `Ctrl+C` e `Ctrl+U` chegando ao Claude, a pergunta de confiança na pasta, o redimensionamento e o `/exit` tirando o terminal da lista. Ver D-014 a D-016.

## Fase 3 — Vários terminais ✅
- [x] Botão "+": escolher diretório e nome, depois spawn com `--session-id` e `--name` (o `--settings` entra na fase 5)
- [x] Lista de terminais ativos ligada ao `pty-manager`
- [x] Troca de terminal preservando o estado (instâncias escondidas, não destruídas)
- [x] Fechar com o diálogo de confirmação, matando o processo
- [x] Atalhos `Ctrl+Tab` / `Ctrl+Shift+Tab`, `Ctrl+Shift+T` e `Ctrl+Shift+W` (D-007)
- [x] Ao fechar o app: confirmar se houver terminal executando e encerrar todos (D-011)
- [x] Tratar o caso em que o processo sai sozinho (`/exit`, crash)

**Pronto quando:** 4 sessões rodam em paralelo e a troca entre elas é instantânea.

**Resultado:** `scripts/e2e/fase-3.cjs` passa os 11 checks: começa vazio, erro de diretório inválido, abrir via diálogo e via chip de diretório recente, `--name` confirmado no registro (`nameSource: user`), `Ctrl+Tab`/`Ctrl+Shift+Tab`, `Ctrl+Shift+W` com confirmação e fechamento da janela sem deixar processos `claude` órfãos. A confirmação ao fechar o app só aparece com terminal trabalhando, o que depende do status real (fase 5).

## Fase 4 — Histórico ✅
- [x] `history.ts` varrendo `~/.claude/projects/` com cache por tamanho + `mtime`
- [x] Título (`customTitle` → `aiTitle` → primeiro prompt), diretório e data relativa ("Hoje, 10:42")
- [x] Clique → `--resume` no `cwd` original, abrindo como terminal ativo
- [x] Busca por título, diretório e branch (sem diferenciar maiúsculas e acentos)
- [x] Tag "em uso" e retomada bloqueada para sessões abertas fora do app (D-010), também validado no main
- [x] Atualização automática quando uma sessão é fechada ou quando qualquer `.jsonl` muda (`fs.watch` recursivo)

**Pronto quando:** qualquer sessão antiga é retomada em um clique.

**Resultado:** com os dados reais (24 sessões, 180 MB, arquivos de até 54 MB), a primeira varredura leva ~94 ms e as seguintes ~1 ms. Cada arquivo é lido só no início (256 KB, uma vez) e no fim (256 KB, quando muda). `scripts/e2e/fase-4.cjs` passa os 8 checks. Corrigido no caminho: fechar pelo app não é mais tratado como erro (o `claude` sai com código 129 no SIGHUP).

## Fase 5 — Status, contexto e uso ✅
- [x] Bolinha executando / aguardando / precisa de você em tempo real, via registro de sessões (D-012)
- [x] Status line injetada + `statusline.ts` alimentando o rodapé (Sessão 5h e Semanal, com reset); terceiro card com o resumo dos terminais (D-006)
- [x] Barra de contexto por terminal e ordenação por uso
- [x] Barra inferior do painel (contexto · modelo · branch)

**Pronto quando:** os números batem com o `/usage` e o `/context` da TUI.

**Resultado:** `scripts/e2e/fase-5.cjs` (um prompt curto com Haiku; a permissão pedida é negada) passa os 11 checks: aguardando → executando → precisa de você → aguardando; uso real no rodapé (ex.: 69% / 43%); contexto "42k / 1M"; barra "contexto 4% (42k / 1M) · Haiku 5.5 · main". D-005 revisada: a status line é uma linha de shell, não um script Node.

## Fase 6 — Polimento
- [ ] Empacotar em AppImage/.deb e criar o atalho `.desktop` no menu
- [ ] Ícone do app

**Pronto quando:** o app substitui o uso diário da TUI pura.
