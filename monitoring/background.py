"""
Фоновый мониторинг. Запускается автоматически при старте Django.
"""

import time
import logging

logger = logging.getLogger('monitoring.background')

DEFAULT_INTERVAL = 300


def start_background_polling():
    logger.info('Фоновый мониторинг запущен')
    time.sleep(10)  # подождать пока БД готова

    while True:
        try:
            interval = _poll_all()
        except Exception as e:
            logger.error('Ошибка фонового мониторинга: %s', e)
            interval = DEFAULT_INTERVAL
        time.sleep(interval)


def _poll_all():
    from .models import DeviceMonitorConfig, GlobalMonitorSettings
    from .services import poll_device
    from mappy.models import Device

    device_ids = DeviceMonitorConfig.objects.filter(
        enabled=True, protocol__enabled=True
    ).values_list('device_id', flat=True).distinct()

    devices = Device.objects.filter(id__in=device_ids, visible_on_map=True)
    total = devices.count()

    if total == 0:
        return DEFAULT_INTERVAL

    logger.info('Фоновый опрос: %d устройств', total)
    ok = fail = 0

    for device in devices:
        results = poll_device(device)
        for proto, result in results.items():
            if result.success:
                ok += 1
            else:
                fail += 1

    logger.info('Опрос завершён: %d OK, %d FAIL', ok, fail)

    # Минимальный интервал из глобальных настроек
    intervals = GlobalMonitorSettings.objects.filter(
        auto_poll_enabled=True
    ).values_list('poll_interval', flat=True)
    return min(intervals) if intervals else DEFAULT_INTERVAL
