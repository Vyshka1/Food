#!/usr/bin/env bash
#
# Собрать приложение и перезапустить службу. Запускать на сервере, из корня
# проекта: sudo -u www-data ./server/deploy.sh
#
# Скрипт ничего не удаляет и не трогает ничего за пределами проекта.

set -euo pipefail

cd "$(dirname "$0")/.."
echo "== проект: $(pwd)"

echo "== забираю изменения"
git pull --ff-only

echo "== ставлю зависимости"
npm ci

echo "== проверки"
npm run typecheck
npm run lint
npm test

# Служба живёт на том же адресе, что и приложение, поэтому путь относительный:
# браузеру не нужно знать домен, а нам — заново собирать сборку при переезде.
echo "== сборка"
VITE_EXTRACT_URL=/api npm run build

echo "== перезапуск службы"
if systemctl is-enabled --quiet food-extract 2>/dev/null; then
  sudo systemctl restart food-extract
  sleep 1
  curl -fsS http://127.0.0.1:8080/health && echo
else
  echo "   служба food-extract не установлена — см. server/README.md"
fi

echo "== готово"
