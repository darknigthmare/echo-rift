#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  node local-server.js
elif command -v python3 >/dev/null 2>&1; then
  (sleep 1; command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:8765/) &
  python3 -m http.server 8765 --bind 127.0.0.1
else
  echo "Ouvrez JOUER_ECHO_RIFT.html dans un navigateur moderne."
fi
