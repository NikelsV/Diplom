# Containerfile для проекта WebMap
# Совместим с rootless Podman.
#
# Используем slim-образ Python. Bookworm — стабильная Debian 12.
FROM docker.io/library/python:3.12-slim-bookworm

# Системные зависимости:
#   - iputils-ping  — нужен для ICMP-поллера (subprocess вызывает ping)
#   - libpq5        — runtime для psycopg
#   - tini          — корректная обработка SIGTERM в контейнере
# build-essential и libpq-dev нужны только если psycopg ставится из исходников;
# мы используем psycopg[binary], поэтому компилятор не требуется.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        iputils-ping \
        libpq5 \
        tini \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Создаём непривилегированного пользователя.
# UID 1000 — типовой для rootless: он маппится на UID хоста через user namespaces.
ARG APP_UID=1000
ARG APP_GID=1000
RUN groupadd --gid ${APP_GID} app \
    && useradd --uid ${APP_UID} --gid ${APP_GID} --create-home --shell /bin/bash app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Сначала ставим зависимости — отдельным слоем для кеширования.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код проекта. .containerignore исключает локальную SQLite-БД, кеши и т.п.
COPY . /app

# Каталоги для медиа и собранной статики. Права отдаём пользователю app,
# чтобы при rootless-маппинге volume не упирался в EACCES.
RUN mkdir -p /app/media /app/staticfiles \
    && chown -R app:app /app

# Скрипт инициализации (миграции + запуск)
COPY --chown=app:app entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER app

# Статика собирается в entrypoint при старте контейнера, а не на этапе сборки.
# Это нужно потому, что /app/staticfiles в продакшене монтируется как volume,
# общий с nginx-контейнером, и содержимое volume при первом запуске должно
# быть наполнено.

EXPOSE 8000

# tini — PID 1, корректно прокидывает сигналы дочерним процессам.
ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]

# По умолчанию — gunicorn. В compose.yaml для разных сервисов команда
# переопределяется (poller-контейнер запускает poll_devices --loop).
CMD ["gunicorn", "webmap.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-"]
