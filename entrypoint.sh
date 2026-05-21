#!/bin/sh
# Скрипт запуска приложения внутри контейнера.
# Используется тремя контейнерами:
#   - web    — запускает gunicorn (см. CMD в Containerfile)
#   - poller — запускает manage.py poll_devices --loop (см. compose.yaml)
# Логика инициализации (ожидание БД, миграции, статика) определяется
# переменными окружения, выставляемыми в compose.yaml:
#   - SKIP_MIGRATIONS=true   — не делать миграции (для poller-контейнера)
#   - SKIP_COLLECTSTATIC=true — не собирать статику (для poller-контейнера)

set -e

# Если используем PostgreSQL — ждём, пока он поднимется.
if [ "${DB_ENGINE}" = "postgresql" ] || [ "${DB_ENGINE}" = "postgres" ]; then
    echo "Ожидание PostgreSQL на ${DB_HOST}:${DB_PORT}..."
    # Простая проверка через python (без зависимости от nc/netcat).
    python - <<'PY'
import os, socket, time, sys
host = os.environ.get('DB_HOST', 'db')
port = int(os.environ.get('DB_PORT', '5432'))
deadline = time.time() + 60
while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            print("PostgreSQL доступен.")
            sys.exit(0)
    except OSError:
        time.sleep(1)
print("Таймаут ожидания PostgreSQL!", file=sys.stderr)
sys.exit(1)
PY
fi

# Миграции применяет только основной web-контейнер.
# Это исключает гонки, когда несколько контейнеров одновременно пытаются
# мигрировать схему БД.
if [ "${SKIP_MIGRATIONS}" != "true" ]; then
    echo "Применение миграций..."
    python manage.py migrate --noinput
fi

# Сборка статики тоже только в web-контейнере. В poller статика не нужна.
# DJANGO_SECRET_KEY используется реальный (а не build-time dummy), но
# collectstatic его не использует — переменная нужна формально.
if [ "${SKIP_COLLECTSTATIC}" != "true" ]; then
    echo "Сборка статики в /app/staticfiles..."
    python manage.py collectstatic --noinput --clear
fi

echo "Запуск: $@"
exec "$@"
