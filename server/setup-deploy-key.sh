#!/usr/bin/env bash
#
# Разовая настройка доступа, чтобы сервер обновлялся сам.
#
#   sudo bash server/setup-deploy-key.sh
#
# Заводит пользователя для выкладки, делает ему ключ и разрешает ровно одну
# команду — обновление приложения. Ничего другого этим ключом сделать нельзя:
# ни зайти в оболочку, ни прокинуть порт, ни выполнить свою команду.
#
# В конце печатает три значения, которые надо вставить в настройки репозитория.

set -euo pipefail

USER_NAME="${USER_NAME:-deploy}"
DIR="${DIR:-/opt/food}"
KEY="/root/.ssh/food-deploy"

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mНе вышло: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "запускать надо от root: sudo bash server/setup-deploy-key.sh"
[ -x "$DIR/server/deploy.sh" ] || fail "не нахожу $DIR/server/deploy.sh — сначала установка"

step "Пользователь $USER_NAME"
if id -u "$USER_NAME" >/dev/null 2>&1; then
  echo "   уже есть"
else
  adduser --system --group --shell /bin/bash --home "/home/$USER_NAME" "$USER_NAME"
  echo "   заведён"
fi
install -d -m 700 -o "$USER_NAME" -g "$USER_NAME" "/home/$USER_NAME/.ssh"

step "Ключ"
if [ -f "$KEY" ]; then
  echo "   уже есть, делаю новый вместо него"
  rm -f "$KEY" "$KEY.pub"
fi
install -d -m 700 /root/.ssh
ssh-keygen -t ed25519 -f "$KEY" -N "" -C "выкладка приложения" -q

# Ключ привязан к одной команде: что бы через него ни прислали, выполнится
# только обновление приложения. Это сильнее, чем ограничение через sudo:
# оболочки у этого ключа нет вовсе.
{
  printf 'command="sudo %s/server/deploy.sh",no-port-forwarding,' "$DIR"
  printf 'no-agent-forwarding,no-X11-forwarding,no-pty '
  cat "$KEY.pub"
} > "/home/$USER_NAME/.ssh/authorized_keys"
chown "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.ssh/authorized_keys"
chmod 600 "/home/$USER_NAME/.ssh/authorized_keys"
echo "   сделан и привязан к одной команде"

step "Право запускать обновление"
printf '%s ALL=(root) NOPASSWD: %s/server/deploy.sh\n' "$USER_NAME" "$DIR" \
  > /etc/sudoers.d/food-deploy
chmod 440 /etc/sudoers.d/food-deploy
visudo -c >/dev/null || fail "sudoers не принял правило"
echo "   разрешена ровно одна команда"

step "Что вставить в GitHub"
cat <<TEXT

  Settings → Secrets and variables → Actions → New repository secret
  https://github.com/Vyshka1/Food/settings/secrets/actions

  SSH_HOST   food.altum-it.ru
  SSH_USER   $USER_NAME
  SSH_KEY    весь текст ниже, вместе со строками BEGIN и END

TEXT
cat "$KEY"
cat <<'TEXT'

После этого сервер обновляется сам, когда в main появляется новое.

Ключ показан один раз и нигде больше не понадобится — закройте терминал, когда
вставите. Отозвать доступ: rm /home/deploy/.ssh/authorized_keys
TEXT
