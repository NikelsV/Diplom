"""
Фоновый мониторинг. Запускается при старте Django, если задана переменная
окружения ENABLE_BACKGROUND_POLLER=true (см. monitoring/apps.py).

В эксплуатационной конфигурации эта переменная не задаётся, и за фоновый
опрос отвечает отдельный сервис, запускающий ту же логику через CLI-команду
manage.py poll_devices --loop (см. compose.yaml, сервис poller).

Цикл опроса – единственная обёртка над сервисной функцией poll_all_active_devices:
бесконечный цикл, между итерациями ожидание на основании настроек протоколов.
"""

import time
import logging

logger = logging.getLogger('monitoring.background')

DEFAULT_INTERVAL = 300


def start_background_polling():
    """Бесконечный цикл фонового опроса. Точка входа фонового потока."""
    logger.info('Фоновый мониторинг запущен')
    time.sleep(10)  # подождать пока БД будет готова после старта контейнеров

    while True:
        try:
            interval = _run_iteration()
        except Exception as e:
            logger.exception('Ошибка фонового мониторинга: %s', e)
            interval = DEFAULT_INTERVAL
        time.sleep(interval)


def _run_iteration():
    """Одна итерация опроса. Возвращает интервал до следующей итерации."""
    # Импорты внутри функции – чтобы модуль можно было импортировать до
    # полной готовности Django (например, на этапе AppConfig.ready).
    from .services import poll_all_active_devices
    from .models import GlobalMonitorSettings

    total, ok, fail, _ = poll_all_active_devices()

    if total == 0:
        return DEFAULT_INTERVAL

    logger.info('Опрос завершён: %d устройств, %d OK, %d FAIL', total, ok, fail)

    # Интервал до следующей итерации – минимум из глобальных настроек
    # активных протоколов; если ничего не задано, используется значение
    # по умолчанию.
    intervals = GlobalMonitorSettings.objects.filter(
        auto_poll_enabled=True
    ).values_list('poll_interval', flat=True)
    return min(intervals) if intervals else DEFAULT_INTERVAL
