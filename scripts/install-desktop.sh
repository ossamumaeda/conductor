#!/usr/bin/env bash
# Instala o Conductor para o usuário atual (sem sudo) e cria o atalho no menu do sistema.
#   bash scripts/install-desktop.sh              instala dist/Conductor-*.AppImage
#   bash scripts/install-desktop.sh --uninstall  remove tudo o que este script criou
# Os dados do app (~/.config/conductor) não são apagados pelo --uninstall.
set -euo pipefail

APP_DIR="$HOME/.local/opt/conductor"
APP_BIN="$APP_DIR/Conductor.AppImage"
ICON="$HOME/.local/share/icons/hicolor/512x512/apps/conductor.png"
DESKTOP="$HOME/.local/share/applications/conductor.desktop"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

refresh_menu() {
  command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
}

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$APP_BIN" "$ICON" "$DESKTOP"
  rmdir "$APP_DIR" 2>/dev/null || true
  refresh_menu
  echo "Conductor removido do menu."
  exit 0
fi

shopt -s nullglob
images=("$ROOT"/dist/Conductor-*.AppImage)
if (( ${#images[@]} == 0 )); then
  echo "Nenhum AppImage em dist/. Rode antes: npm run dist" >&2
  exit 1
fi
SRC="${images[-1]}"

mkdir -p "$APP_DIR" "$(dirname "$ICON")" "$(dirname "$DESKTOP")"
install -m 755 "$SRC" "$APP_BIN"
install -m 644 "$ROOT/build/icon.png" "$ICON"
cat > "$DESKTOP" <<DESKTOP_ENTRY
[Desktop Entry]
Type=Application
Name=Conductor
Comment=Sessões do Claude Code em uma interface gráfica
Exec="$APP_BIN" %U
Icon=conductor
Terminal=false
Categories=Development;
StartupWMClass=conductor
DESKTOP_ENTRY
chmod 644 "$DESKTOP"
refresh_menu
echo "Instalado: $APP_BIN"
echo "Atalho:    $DESKTOP"
