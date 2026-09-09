#!/usr/bin/env bash
#
# Поставить приложение и службу разбора ссылок на чистый сервер — целиком.
#
# Ставит Node, nginx и certbot, забирает проект, собирает приложение, заводит
# службу, настраивает сайт и выпускает сертификат. Запускать от root:
#
#   sudo EMAIL=вы@почта.ru bash server/bootstrap.sh
#
# Или, если проекта на сервере ещё нет, одной командой:
#
#   curl -fsSL https://raw.githubusercontent.com/Vyshka1/Food/main/server/bootstrap.sh \
#     | sudo EMAIL=вы@почта.ru bash
#
# Скрипт можно запускать повторно: он ничего не ломает и не стирает. Готовые
# файлы, которые он собирается заменить, сохраняются рядом с меткой времени.

set -euo pipefail

DOMAIN="${DOMAIN:-food.altum-it.ru}"
REPO="${REPO:-https://github.com/Vyshka1/Food.git}"
BRANCH="${BRANCH:-main}"
DIR="${DIR:-/opt/food}"
PORT="${PORT:-8080}"
EMAIL="${EMAIL:-}"
# сертификат можно отложить: SKIP_CERT=1
SKIP_CERT="${SKIP_CERT:-0}"

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mНе вышло: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "запускать надо от root: sudo EMAIL=… bash server/bootstrap.sh"
command -v apt-get >/dev/null || fail "скрипт рассчитан на Debian или Ubuntu"
if [ "$SKIP_CERT" != "1" ] && [ -z "$EMAIL" ]; then
  fail "укажите почту для Let's Encrypt: EMAIL=вы@почта.ru (или SKIP_CERT=1, чтобы пока без сертификата)"
fi

step "Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx ca-certificates iproute2 >/dev/null

# Node 22: службе хватило бы восемнадцатой, но сборка прогоняет тесты, а им
# нужна двадцать вторая
NEED_NODE=1
if command -v node >/dev/null; then
  CURRENT="$(node -v | sed 's/^v//' | cut -d. -f1)"
  [ "$CURRENT" -ge 22 ] && NEED_NODE=0
fi
if [ "$NEED_NODE" = 1 ]; then
  step "Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "   node $(node -v), npm $(npm -v)"

# yt-dlp — только для ссылок на ролики. Без него ссылки на блоги работают, а
# вставка текста руками работает всегда, поэтому неудача здесь не смертельна.
if ! command -v yt-dlp >/dev/null; then
  step "yt-dlp (для ссылок на ролики)"
  if curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp 2>/dev/null; then
    chmod a+rx /usr/local/bin/yt-dlp
    echo "   поставлен: $(yt-dlp --version 2>/dev/null || echo 'не отвечает')"
  else
    echo "   не скачался — ссылки на ролики работать не будут, остальное будет"
  fi
fi

step "Проект в $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --quiet origin "$BRANCH"
  git -C "$DIR" checkout --quiet "$BRANCH"
  git -C "$DIR" reset --hard --quiet "origin/$BRANCH"
else
  mkdir -p "$(dirname "$DIR")"
  git clone --quiet --branch "$BRANCH" "$REPO" "$DIR"
fi
echo "   $(git -C "$DIR" log --oneline -1)"

step "Сборка приложения"
cd "$DIR"
npm ci --silent
npm run typecheck
npm test
# служба живёт по тому же адресу, что и приложение, поэтому путь относительный
VITE_EXTRACT_URL=/api npm run build
[ -f "$DIR/dist/index.html" ] || fail "сборка не создала dist/index.html"

step "Служба food-extract"
id -u food-extract >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin food-extract
cat > /etc/systemd/system/food-extract.service <<UNIT
[Unit]
Description=Разбор рецептов по ссылке
After=network.target

[Service]
Type=simple
User=food-extract
WorkingDirectory=$DIR
ExecStart=$(command -v node) $DIR/server/index.mjs
Environment=PORT=$PORT
# у служебного пользователя нет домашней папки, а yt-dlp хочет куда-то писать
# кэш; без этого он падает на первой же ссылке
Environment=HOME=/tmp
Environment=XDG_CACHE_HOME=/tmp
Restart=always
RestartSec=2
# служба ходит в интернет по чужим ссылкам — держим её в тесной коробке
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
# read-only, а не true: свои файлы служба должна читать, а проект может лежать
# и в домашней папке — тогда true оставил бы её вовсе без них
ProtectHome=read-only
ProtectKernelTunables=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --quiet --now food-extract
systemctl restart food-extract
sleep 1
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null \
  || fail "служба не отвечает: journalctl -u food-extract -n 50"
echo "   отвечает на 127.0.0.1:$PORT"

step "Сайт $DOMAIN"
SITE="/etc/nginx/sites-available/$DOMAIN"
if [ -f "$SITE" ]; then
  cp "$SITE" "$SITE.бэкап-$(date +%Y%m%d-%H%M%S)"
  echo "   прежний конфиг сохранён рядом"
fi
sed -e "s|food\.altum-it\.ru|$DOMAIN|g" \
    -e "s|/opt/food/dist|$DIR/dist|g" \
    -e "s|127\.0\.0\.1:8080|127.0.0.1:$PORT|g" \
    "$DIR/server/nginx.conf.example" > "$SITE"
ln -sfn "$SITE" "/etc/nginx/sites-enabled/$DOMAIN"
# сайт по умолчанию перехватывает запросы, если наш не совпал по имени
[ -e /etc/nginx/sites-enabled/default ] && rm -f /etc/nginx/sites-enabled/default
nginx -t || fail "nginx не принял конфиг"

# nginx после установки не запущен, и перезагружать тогда нечего. А если он не
# запускается вовсе — почти всегда потому, что порт 80 уже занят другим
# веб-сервером. Молчать об этом нельзя: сообщение systemd об этом не говорит.
if systemctl is-active --quiet nginx; then
  systemctl reload nginx
else
  if ! systemctl enable --now nginx 2>/dev/null || ! systemctl is-active --quiet nginx; then
    echo
    echo "   nginx не запустился. Кто занимает порты 80 и 443:"
    ss -tlnp 2>/dev/null | grep -E ':80 |:443 ' || echo "   (ss не установлен: apt-get install -y iproute2)"
    echo
    fail "порт 80 занят другим веб-сервером — остановите его (systemctl stop ИМЯ) или настройте сайт в нём, а не в nginx"
  fi
fi
echo "   включён"

if [ "$SKIP_CERT" = "1" ]; then
  step "Сертификат пропущен"
  echo "   потом: sudo certbot --nginx -d $DOMAIN"
else
  step "Сертификат Let's Encrypt"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect \
    || fail "certbot не смог выпустить сертификат. Чаще всего это значит, что $DOMAIN не указывает на этот сервер или порт 80 закрыт снаружи"
fi

step "Проверка"
SCHEME=https
[ "$SKIP_CERT" = "1" ] && SCHEME=http
for path in "/" "/api/health"; do
  CODE="$(curl -fsS -o /dev/null -w '%{http_code}' "$SCHEME://$DOMAIN$path" || echo нет)"
  printf '   %-14s %s\n' "$path" "$CODE"
done

printf '\n\033[32mГотово. Приложение: %s://%s\033[0m\n' "$SCHEME" "$DOMAIN"
echo "Обновлять потом: cd $DIR && sudo ./server/deploy.sh"
