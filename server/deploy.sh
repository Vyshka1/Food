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

echo "== запуск"
# На сервере, где уже стоит Traefik, приложение живёт контейнерами за ним:
# порты 80 и 443 заняты, и отбирать их нельзя — за Traefik стоят другие сайты.
# Без Docker работает обычный путь: nginx на хосте и служба под systemd.
if docker info >/dev/null 2>&1 && docker network inspect proxy >/dev/null 2>&1; then
  echo "   контейнерами за Traefik"
  docker compose up -d --build
  sleep 2
  docker compose ps
elif systemctl is-enabled --quiet food-extract 2>/dev/null; then
  echo "   службой на хосте"
  sudo systemctl restart food-extract
  sleep 1
  curl -fsS http://127.0.0.1:8080/health && echo
else
  echo "   ни Docker с сетью proxy, ни службы food-extract — см. server/README.md"
fi

echo "== готово"
