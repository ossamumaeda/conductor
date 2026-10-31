# Fontes de dados

Mapeia cada elemento da interface para a origem do dado. **Validado na fase 0** com o Claude Code **2.1.316** (2026-10-31). Os scripts e as capturas brutas estão em `spikes/fase-0/`.

> ⚠️ Só os **flags do CLI**, o **payload da status line** e os **payloads de hooks** são interfaces documentadas. Os arquivos em `~/.claude/` são formatos internos e podem mudar entre versões (ver D-004).

## Mapa da interface

| Elemento | Fonte | Campo(s) |
|---|---|---|
| Lista de terminais ativos | estado do próprio app (`pty-manager`) | — |
| Bolinha de status (executando / aguardando / precisa de você) | `~/.claude/sessions/<pid>.json` | `status`: `busy` / `idle` / `waiting` (D-012) |
| Nome do terminal | flag `--name` | registro: `name` · `.jsonl`: `customTitle` · status line: `session_name` |
| Diretório | registro · `.jsonl` · status line | `cwd` |
| Contexto da sessão | status line | `context_window.*` |
| Modelo | status line | `model.display_name` (ex.: `Haiku 5.5`) |
| Branch | `.jsonl` | `gitBranch` |
| Histórico: título | `.jsonl` | `customTitle` (se tiver `--name`) → senão `aiTitle` → senão o primeiro prompt |
| Histórico: diretório / data | `.jsonl` | `cwd` · `timestamp` |
| Histórico: tag "em uso" | `~/.claude/sessions/*.json` de processos de fora do app | `sessionId` (D-010) |
| Rodapé: Sessão (5h) e Semanal | status line | `rate_limits.five_hour` · `rate_limits.seven_day` |

## `~/.claude/sessions/<pid>.json` (registro de sessões em execução)

Há um arquivo por processo `claude` interativo. **É removido quando o processo termina**, tanto com `/exit` quanto com o processo morto (fechar o pty).

```json
{
  "pid": 1938666,
  "sessionId": "b41fa5ec-…",
  "cwd": "/home/<usuario>/…/workdir",
  "name": "fase0-spike",
  "nameSource": "user",
  "status": "idle",
  "kind": "interactive",
  "updatedAt": 1793465603259
}
```

- `nameSource`: `user` quando veio de `--name`, `derived` quando o Claude gerou o nome.
- Ignorar os arquivos `<pid>.<hash>.key` na mesma pasta.

### Transições de `status` observadas

```
idle ──(prompt enviado)──▶ busy ──(pedido de permissão)──▶ waiting ──(aprovado)──▶ busy ──(terminou)──▶ idle
```

Tempos medidos: `waiting` aparece em **~1 s** após a ferramenta ser solicitada. O hook `Notification` só disparou **6 s depois**. Por isso o registro é a fonte do aviso "precisa de você" (D-012).

O binário também contém o valor `requires_action`, aparentemente usado em sessões remotas e em segundo plano. Tratar qualquer status desconhecido como "aguardando".

## `~/.claude/projects/<cwd-codificado>/<sessionId>.jsonl`

Cada linha é um evento. O nome da pasta é o `cwd` com `/` trocado por `-`. Essa conversão é ambígua, então o `cwd` real deve vir do campo `cwd` das linhas.

- **O arquivo só é criado quando a primeira mensagem é enviada.** Uma sessão aberta e fechada sem mensagens não aparece no histórico. Isso é esperado.
- Campos usados: `type`, `sessionId`, `cwd`, `gitBranch`, `timestamp`, `customTitle`, `aiTitle` (pode repetir; vale o último), `isSidechain` (mensagens de subagentes; ignorar).

### Contexto sem status line (fallback para o histórico)
Na última linha `assistant` com `isSidechain: false`, somar `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` de `message.usage`.

## Payload da status line (capturado)

O comando da status line recebe o JSON pela entrada padrão a cada atualização. Trecho relevante (sem `cost`, `prompt_cache` etc.):

```jsonc
{
  "session_id": "b41fa5ec-…",          // igual ao --session-id passado
  "session_name": "fase0-spike",
  "cwd": "/home/<usuario>/…/workdir",
  "model": { "id": "claude-haiku-5-5", "display_name": "Haiku 5.5" },
  "version": "2.1.316",
  "context_window": {
    "context_window_size": 1000000,    // varia por modelo: NÃO fixar 200k
    "current_usage": {
      "input_tokens": 2, "output_tokens": 79,
      "cache_creation_input_tokens": 128, "cache_read_input_tokens": 40702
    },
    "used_percentage": 4,
    "remaining_percentage": 96
  },
  "rate_limits": {
    "five_hour": { "used_percentage": 45, "resets_at": 1793474400 },  // resets_at em segundos Unix
    "seven_day": { "used_percentage": 40, "resets_at": 1793973600 }
  }
}
```

- Tokens de contexto exibidos ("41k / 1M") = soma dos três campos `input`/`cache_*` de `current_usage`, sobre `context_window_size`.
- `rate_limits.*` só aparece enquanto a API informa os limites. No plano **Pro** testado, vieram só `five_hour` e `seven_day`, sem os semanais por modelo. **Consequência para a D-006:** o terceiro card não tem dado nesse plano.
- Os limites são da conta, então o rodapé usa o payload **mais recente** entre todas as sessões.

## Payloads de hooks (capturados)

Todos trazem `session_id`, `cwd`, `hook_event_name` e `permission_mode`. Específicos:

| Evento | Campos úteis | Quando disparou |
|---|---|---|
| `UserPromptSubmit` | `prompt`, `session_title` | Ao enviar o prompt |
| `PreToolUse` | `tool_name`, `tool_input` | Antes da ferramenta |
| `PermissionRequest` | `tool_name`, `tool_input`, `permission_suggestions` | Imediatamente ao pedir permissão |
| `Notification` | `message`, `notification_type` | **6 s depois** do pedido |

Valores de `notification_type` encontrados no binário: `permission_prompt`, `idle_prompt`, `elicitation_dialog`, `elicitation_url_dialog`, `agent_needs_input`, `agent_completed`, `worker_permission_prompt`, `auth_success`, `push_notification`.

O app **não usa hooks** por enquanto (D-012). Fica registrado caso o `status: waiting` deixe de existir.

## Flags do CLI usados (validados juntos numa sessão interativa)

| Flag | Uso no app |
|---|---|
| `--session-id <uuid>` | Fixar o ID de uma sessão nova (D-009). Confirmado: é o mesmo `session_id` da status line e do registro. |
| `-n, --name <nome>` | Nome na lista. Confirmado: aparece no registro, no `.jsonl` e na barra da própria TUI. |
| `-r, --resume <id>` | Retomar uma sessão do histórico |
| `--settings <json>` | Injetar o `statusLine` do app (D-005). Confirmado: não altera o `~/.claude/settings.json`. |
| `--model <modelo>` | Futuro: escolher o modelo ao criar um terminal |

## Ambiente de build (validado)

- Electron **45.2.1** (ABI 150) + `node-pty` **1.1.0**, recompilado com `@electron/rebuild` sem erros.
- Um pty dentro do processo principal do Electron executou o `claude` com sucesso.
