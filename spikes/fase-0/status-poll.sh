#!/usr/bin/env bash
# Fase 0: registra mudanças de "status" no registro de sessões para um sessionId.
SID="$1"; last=""
while true; do
  f=$(grep -l "\"sessionId\":\"$SID\"" ~/.claude/sessions/*.json 2>/dev/null | head -1)
  s=$( [ -n "$f" ] && grep -o '"status":"[^"]*"' "$f" || echo "(sem arquivo)")
  [ "$s" != "$last" ] && echo "$(date +%T.%3N) $s" >> "$(dirname "$0")/out/status.log" && last="$s"
  sleep 0.2
done
