# WebMap — инструкция по запуску

В проекте предусмотрено два способа запуска:

1. **В контейнере Podman** — рекомендуемый. Поднимает сразу и Django-приложение, и PostgreSQL. Не требует установки Python, БД и зависимостей на хост-машину.
2. **Локально через git bash на Windows** — для разработки и отладки. Использует SQLite, без контейнера, без PostgreSQL.

---

## Способ 1. Запуск в контейнере Podman

### 1.1. Установка Podman

#### Linux (Ubuntu / Debian)

```bash
sudo apt update
sudo apt install -y podman podman-compose
```

#### Linux (Fedora / RHEL)

```bash
sudo dnf install -y podman podman-compose
```

#### Windows

1. Скачайте установщик с официального сайта: https://podman.io/docs/installation#windows
2. Установите Podman Desktop или Podman CLI.
3. Откройте PowerShell **от имени администратора** и выполните:
   ```powershell
   podman machine init
   podman machine start
   ```
   Эта виртуальная машина (на WSL2) нужна, потому что Podman, как и Docker, под капотом работает на Linux-ядре. После `machine start` команда `podman` доступна из обычного терминала и из git bash.
4. Установите `podman-compose`:
   ```bash
   pip install podman-compose
   ```
   (нужен Python 3 — он есть в составе Podman Desktop, либо ставится отдельно)

#### macOS

```bash
brew install podman podman-compose
podman machine init
podman machine start
```

### 1.2. Проверка, что Podman работает в rootless-режиме

```bash
podman info | grep -i rootless
```

Должно выйти что-то вроде `rootless: true`. Если на Linux выдаётся `false` — обычный пользователь не настроен для rootless-режима. Решается:

```bash
# Подсети для user namespaces:
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 $USER
podman system migrate
```

После этого выйти из системы и зайти заново.

### 1.3. Подготовка окружения

В корне проекта есть файл `.env.example`. Скопируйте его в `.env`:

```bash
cp .env.example .env
```

Откройте `.env` любым редактором и поправьте при необходимости. Минимально достаточно изменить `DJANGO_SECRET_KEY` (для продакшена обязательно) и `DB_PASSWORD`.

### 1.4. Сборка и запуск

```bash
podman-compose up -d --build
```

Что происходит:

- собирается образ `localhost/webmap:latest` из `Containerfile`,
- скачиваются официальные образы `postgres:16-alpine` и `nginx:alpine`,
- запускаются четыре контейнера: `webmap-db`, `webmap-web`, `webmap-poller`, `webmap-nginx`,
- внутри `webmap-web` стартует `entrypoint.sh`, который ждёт пока БД будет готова, прогоняет миграции, собирает статику и запускает gunicorn,
- внутри `webmap-poller` запускается команда `manage.py poll_devices --loop` — это отдельный процесс фонового опроса устройств, независимый от веб-обработчиков,
- внутри `webmap-nginx` поднимается nginx, который проксирует HTTP-запросы на gunicorn, а статику и медиа отдаёт сам с диска (через общие volume с `webmap-web`),
- благодаря миграциям при первом запуске автоматически создаются 153 региона России и протокол SNMP v2c.

Проверка, что контейнеры поднялись:

```bash
podman ps
```

Должны быть видны четыре контейнера со статусом `Up`. Снаружи доступен только порт 8000 контейнера `webmap-nginx` — остальные общаются через внутреннюю сеть.

Назначение каждого сервиса:

- **db** — PostgreSQL, единственное место хранения данных.
- **web** — Django + gunicorn, обрабатывает HTTP-запросы, делает миграции и собирает статику при первом старте.
- **poller** — отдельный процесс фонового опроса. Вынесен в собственный контейнер потому, что если запускать опрос в каждом из gunicorn-воркеров (а их по умолчанию 3), один и тот же опрос идёт втрое чаще, чем нужно, и появляются конфликты в БД.
- **nginx** — фронт-сервер. Отдаёт статику и медиа напрямую с диска (для медиа — с проверкой прав через X-Accel-Redirect), всё остальное проксирует на gunicorn.

Логи приложения:

```bash
podman logs -f webmap-web
```

### 1.5. Создание суперпользователя

С версии, в которой реализована аутентификация, **без учётной записи в приложение зайти нельзя**: и основной интерфейс, и админка требуют входа. Поэтому создание пользователя — обязательный шаг после первого запуска:

```bash
podman exec -it webmap-web python manage.py createsuperuser
```

Введите логин, email (можно пустой) и пароль. Этот пользователь будет иметь полные права: доступ ко всем страницам, ко всему API и к административной панели.

В дальнейшем дополнительных пользователей с ограниченными правами можно создавать через админку: `/admin/auth/user/`.

### 1.6. Открыть приложение

Откройте в браузере:

- http://localhost:8000/ — главная карта России (потребует входа).
- http://localhost:8000/accounts/login/ — страница входа в систему.
- http://localhost:8000/admin/ — административная панель.

### 1.7. Полезные команды

```bash
# Остановить, не удаляя контейнеры:
podman-compose stop

# Запустить снова:
podman-compose start

# Полностью остановить и удалить контейнеры (volume с БД сохранится):
podman-compose down

# Удалить ВСЁ, включая данные БД:
podman-compose down -v

# Зайти в контейнер с веб-приложением:
podman exec -it webmap-web bash

# Зайти в PostgreSQL изнутри:
podman exec -it webmap-db psql -U webmap -d webmap

# Перезапустить только web (после правки кода — образ пересобирается):
podman-compose up -d --build web

# Запустить произвольную manage-команду:
podman exec -it webmap-web python manage.py poll_devices

# Посмотреть, сколько ресурсов кушают контейнеры:
podman stats
```

### 1.8. Запуск без podman-compose (только podman)

Если по какой-то причине `podman-compose` недоступен, можно поднять всё чистыми командами `podman`:

```bash
# 1. Создаём общую сеть:
podman network create webmap-net

# 2. Запускаем PostgreSQL:
podman run -d --name webmap-db \
    --network webmap-net \
    -e POSTGRES_DB=webmap \
    -e POSTGRES_USER=webmap \
    -e POSTGRES_PASSWORD=webmap_pass \
    -v webmap_db_data:/var/lib/postgresql/data \
    docker.io/library/postgres:16-alpine

# 3. Собираем образ приложения:
podman build -t localhost/webmap:latest -f Containerfile .

# 4. Запускаем приложение:
podman run -d --name webmap-web \
    --network webmap-net \
    -p 8000:8000 \
    -e DJANGO_SECRET_KEY="change-me" \
    -e DJANGO_DEBUG=True \
    -e DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0 \
    -e DB_ENGINE=postgresql \
    -e DB_NAME=webmap \
    -e DB_USER=webmap \
    -e DB_PASSWORD=webmap_pass \
    -e DB_HOST=webmap-db \
    -e DB_PORT=5432 \
    -v webmap_media:/app/media \
    -v webmap_static:/app/staticfiles \
    localhost/webmap:latest
```

Остановить и удалить:

```bash
podman stop webmap-web webmap-db
podman rm webmap-web webmap-db
podman network rm webmap-net
# Удалить volume:
podman volume rm webmap_db_data webmap_media webmap_static
```

---

## Способ 2. Запуск через git bash на Windows (без контейнера)

Подходит для разработки. Использует SQLite вместо PostgreSQL.

### 2.1. Подготовка

Установлен должен быть Python 3.10+ (проверьте: `python --version`).

В git bash:

```bash
cd /c/path/to/project   # путь к корню проекта

# Виртуальное окружение
python -m venv .venv
source .venv/Scripts/activate

# Зависимости
pip install -r requirements.txt
```

> Примечание: при установке `psycopg[binary]` на Windows бинарные колёса для нужной версии Python обычно есть в PyPI, но если ставить из исходников — потребуется Visual C++ Build Tools. Для локального запуска через SQLite сам psycopg не используется, можете спокойно его проигнорировать, если установка зависнет.

### 2.2. Применение миграций

Без переменной `DB_ENGINE` Django автоматически выберет SQLite:

```bash
python manage.py migrate
python manage.py createsuperuser
```

### 2.3. Запуск dev-сервера

```bash
python manage.py runserver
```

Откройте http://127.0.0.1:8000/.

### 2.4. Если нужен PostgreSQL и без контейнера

Установите PostgreSQL вручную (например, через https://www.postgresql.org/download/windows/) и в git bash перед запуском:

```bash
export DB_ENGINE=postgresql
export DB_NAME=webmap
export DB_USER=webmap
export DB_PASSWORD=ваш_пароль
export DB_HOST=localhost
export DB_PORT=5432

python manage.py migrate
python manage.py runserver
```

---

## Решение типовых проблем

### Контейнер сразу падает с ошибкой `EACCES` на /app/media

Возникает на SELinux-системах (Fedora, RHEL). Решение: добавьте суффикс `:Z` к volume в `compose.yaml`:

```yaml
- webmap_media:/app/media:Z
```

`:Z` говорит Podman пометить содержимое volume правильным контекстом SELinux.

### Порт 8000 занят

В `compose.yaml` поменяйте маппинг:

```yaml
ports:
  - "8080:8000"   # снаружи 8080, внутри 8000
```

И заходите на http://localhost:8080/.

### Не удаётся подключиться к БД из контейнера

Проверьте, что переменная `DB_HOST=db` (имя сервиса в `compose.yaml`), а не `localhost`. Внутри сети контейнеров БД доступна по имени сервиса, не по `localhost`.

### Нужно сбросить базу и начать с нуля

```bash
podman-compose down -v       # удалит volume webmap_db_data
podman-compose up -d --build # запуск с нуля, миграции применятся заново
```

### Изменения в коде не подхватываются

При запуске через `podman-compose` код «вшит» в образ. После правки нужно пересобрать:

```bash
podman-compose up -d --build web
```

Если хотите live-reload при разработке — можете замонтировать код проекта как volume. В `compose.yaml` для сервиса `web` добавьте:

```yaml
volumes:
  - .:/app
  - webmap_media:/app/media
  - webmap_static:/app/staticfiles
```

И запускайте Django dev-сервер вместо gunicorn — переопределив команду:

```yaml
command: python manage.py runserver 0.0.0.0:8000
```

### Фоновый поток мониторинга не запускается

Поток стартует только при `RUN_MAIN=true`. В `entrypoint.sh` эта переменная выставляется автоматически. Если вы запускаете Django вручную через `runserver` — она тоже установится сама (Django ставит её в дочернем процессе авто-перезагрузчика). Но если запускаете через что-то нестандартное (например, gunicorn без `entrypoint.sh`) — проставьте вручную:

```bash
export RUN_MAIN=true
```

### ICMP-поллер: ошибка `Operation not permitted: ping`

Эта ошибка возникает в rootless-контейнере: `ping` пытается открыть ICMP-сокет, но непривилегированному пользователю это не разрешено.

**В проекте уже реализовано трёхуровневое решение в самом поллере** (`monitoring/pollers/icmp.py`):

1. Сначала пробуется unprivileged ICMP datagram-сокет (Python-реализация без `subprocess`).
2. Если не вышло — системная команда `ping`.
3. Если и она не работает — TCP-фолбэк: попытка установить TCP-соединение на порты 80/443/22. Это надёжно показывает, что хост жив, даже если ICMP заблокирован.

То есть **поллер будет работать всегда**, но если ICMP всё-таки нужен (например, ради измерения RTT), есть три варианта.

#### Вариант А (рекомендуется): включён в `compose.yaml`

В `compose.yaml` для сервиса `web` уже добавлены:

```yaml
sysctls:
  net.ipv4.ping_group_range: "0 2147483647"
cap_add:
  - NET_RAW
```

В большинстве случаев этого достаточно. Чтобы изменения подхватились, пересоздайте контейнер:

```bash
podman-compose down
podman-compose up -d --build
```

Проверка:

```bash
podman exec -it webmap-web ping -c 1 8.8.8.8
```

#### Вариант Б: настройка хоста (Linux)

Если на вашем ядре `net.ipv4.ping_group_range` не разрешает менять sysctl изнутри контейнера, расширьте диапазон на хосте — это безопасно, это лишь разрешает unprivileged ICMP datagram-сокеты:

```bash
# Временно (до перезагрузки):
sudo sysctl -w net.ipv4.ping_group_range="0 2147483647"

# Постоянно — добавить в /etc/sysctl.d/99-ping.conf:
echo 'net.ipv4.ping_group_range = 0 2147483647' | sudo tee /etc/sysctl.d/99-ping.conf
sudo sysctl --system
```

После этого пересоздайте контейнер.

#### Вариант В: запуск без compose, чистым podman

```bash
podman run -d --name webmap-web \
    --network webmap-net \
    -p 8000:8000 \
    --cap-add=NET_RAW \
    --sysctl net.ipv4.ping_group_range="0 2147483647" \
    -e DB_ENGINE=postgresql \
    ... (остальные переменные) \
    localhost/webmap:latest
```

#### Вариант Г: только TCP-фолбэк

Если по политике безопасности хоста ICMP нельзя разрешить вообще — поллер автоматически переключится на TCP-проверку. Можно сразу настроить нужные порты для конкретного устройства через Django Admin → «Настройки мониторинга устройств» → параметр `tcp_fallback_ports` (например, `80,443` для веб-сервера или `22` для Linux-машины).

Если TCP-фолбэк тоже не нужен — выключите его параметром `tcp_fallback=False` в той же админке.

#### Как понять, какой метод сработал

В таблице истории мониторинга (`/monitoring/`) у каждой записи есть поле «Детали». Там будет:

- `{"method": "icmp_unpriv", "rtt_avg_ms": 12.3}` — сработал unprivileged ICMP.
- `{"method": "icmp_subproc", "rtt_avg_ms": 12.3}` — сработала команда `ping`.
- `{"method": "tcp_check", "tcp_port": 80, "rtt_avg_ms": 5.0}` — TCP-фолбэк.
- `{"error": "host unreachable", "attempts": [...]}` — все методы провалились, в `attempts` причины.

---

## Что было изменено в проекте

1. **Тип связи по умолчанию** — теперь `'line'` вместо `'arrow'`. Изменения в:
   - `mappy/models.py` (поле `Connection.line_type`),
   - `mappy/static/mappy/js/floor.js` (запрос на создание связи),
   - `mappy/migrations/0006_connection_line_default.py` — новая миграция, меняет default в БД.

2. **PostgreSQL вместо SQLite** — настройки БД в `webmap/settings.py` теперь читаются из переменных окружения. Если `DB_ENGINE=postgresql` — используется Postgres, иначе — SQLite (для локальной отладки). В `requirements.txt` добавлен `psycopg[binary]` и `gunicorn`.

3. **Контейнеризация** — добавлены `Containerfile`, `entrypoint.sh`, `compose.yaml`, `.containerignore`, `.env.example`. Образ работает в rootless Podman: непривилегированный пользователь `app` (UID 1000), `tini` как PID 1, gunicorn как продакшен-сервер. PostgreSQL — отдельный сервис `db`, volume для данных переживает пересборку контейнера.

4. **Совместимость с git bash на Windows** сохранена — без переменной `DB_ENGINE` проект работает на SQLite ровно как раньше.
