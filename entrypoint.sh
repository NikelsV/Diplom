#!/bin/sh
# Скрипт запуска приложения внутри контейнера.
# Ждёт PostgreSQL, применяет миграции, собирает статику, запускает основной процесс.

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

# Применяем миграции (включая data-миграции: 153 региона, SNMP-протокол).
echo "Применение миграций..."
python manage.py migrate --noinput

# RUN_MAIN=true нужен, чтобы фоновый поток мониторинга стартовал
# (см. monitoring/apps.py: проверка os.environ.get('RUN_MAIN') != 'true').
export RUN_MAIN=true

echo "Запуск: $@"
exec "$@"
