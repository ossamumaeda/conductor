# Conductor

Interface desktop (Linux) para usar o **Claude Code** com várias sessões ao mesmo tempo: lista de terminais ativos com status e contexto, histórico com retomada em um clique e o uso do plano (5h e semanal) sempre à vista.

Cada terminal roda o `claude` oficial, então funciona com o login da assinatura (Pro/Max) e mantém todos os recursos da TUI.

## Usar

Depois de instalado, abra **Conductor** pelo menu de aplicativos.

| Atalho | Ação |
|---|---|
| `Ctrl+Shift+T` | Novo terminal (diretório + nome) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Próximo / anterior terminal |
| `Ctrl+Shift+W` | Fechar terminal (com confirmação) |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copiar seleção / colar texto no terminal |

`Ctrl+C`, `Ctrl+V`, `Ctrl+T`, `Ctrl+W` etc. continuam indo para o Claude.

Bolinha de status: **verde** executando · **amarela** aguardando · **laranja pulsando** precisa de você (ex.: pedido de permissão). Com a janela fora de foco, o "precisa de você" também gera uma notificação do sistema.

## Instalar / atualizar

```bash
npm install
npx electron --version     # só na primeira vez: baixa o binário do Electron
npm run dist               # gera dist/Conductor-<versão>.AppImage
npm run install-desktop    # copia para ~/.local/opt/conductor e cria o atalho no menu
```

Remover: `bash scripts/install-desktop.sh --uninstall` (os dados em `~/.config/conductor` ficam).

## Desenvolver

```bash
npm run dev          # hot reload
npm run typecheck
npm run build
```

Documentação completa (decisões, arquitetura, fontes de dados, roadmap e testes) em [`docs/`](docs/README.md).
