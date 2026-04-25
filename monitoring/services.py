"""
Сервисный слой мониторинга.
"""

from django.utils import timezone
from .models import MonitorProtocol, DeviceMonitorConfig, MonitoringHistory
from .pollers.base import registry


def poll_device(device, protocol_id=None):
    """
    Опросить устройство.
    protocol_id — если указан, опрос только по этому протоколу (poller_id строка).
    Возвращает dict: {poller_id: PollResult}
    """
    results = {}
    configs = DeviceMonitorConfig.objects.filter(device=device, enabled=True)
    if protocol_id:
        configs = configs.filter(protocol__poller_id=protocol_id)

    for config in configs:
        poller = registry.get(config.protocol.poller_id)
        if not poller:
            continue
        if not device.ip_address:
            from .pollers.base import PollResult
            results[config.protocol.poller_id] = PollResult(
                success=False, details={'error': 'IP-адрес не задан'}
            )
            continue

        effective_params = config.get_effective_params()
        result = poller.poll(device.ip_address, effective_params)
        results[config.protocol.poller_id] = result
        _update_history(device, config.protocol, result.success, result.details)

    return results


def _update_history(device, protocol, success, details):
    """
    Обновить историю: ищет последний период по (device, protocol).
    Продлевает если статус тот же И между сканированиями не было длинной паузы.
    Создаёт новый если статус изменился ИЛИ пауза > poll_interval * 1.5.
    """
    from .models import GlobalMonitorSettings
    now = timezone.now()

    # Определяем максимально допустимый разрыв между сканированиями
    max_gap_seconds = 300 * 1.5  # default: 450 сек
    try:
        gs = protocol.global_settings
        max_gap_seconds = gs.poll_interval * 1.5
    except GlobalMonitorSettings.DoesNotExist:
        pass

    last = MonitoringHistory.objects.filter(
        device=device, protocol=protocol
    ).order_by('-started_at').first()

    if last is None:
        # Первый опрос
        MonitoringHistory.objects.create(
            device=device, protocol=protocol,
            status=success, details=details
        )
    elif last.status != success:
        # Статус изменился — закрыть старый, открыть новый
        if last.ended_at is None:
            last.ended_at = now
            last.save(update_fields=['ended_at'])
        MonitoringHistory.objects.create(
            device=device, protocol=protocol,
            status=success, details=details
        )
    else:
        # Статус тот же — проверяем разрыв по времени
        last_time = last.ended_at or last.started_at
        gap = (now - last_time).total_seconds()
        if gap > max_gap_seconds:
            # Слишком большой разрыв — закрыть старый, создать новый
            if last.ended_at is None:
                last.ended_at = last_time
                last.save(update_fields=['ended_at'])
            MonitoringHistory.objects.create(
                device=device, protocol=protocol,
                status=success, details=details
            )
        else:
            # Продлить текущий период
            last.ended_at = now
            last.details = details
            last.save(update_fields=['ended_at', 'details'])


def get_device_status(device):
    """None=не настроен, True=всё ок, False=есть проблемы."""
    configs = DeviceMonitorConfig.objects.filter(device=device, enabled=True)
    if not configs.exists():
        return None
    has_any_result = False
    for config in configs:
        last = MonitoringHistory.objects.filter(
            device=device, protocol=config.protocol
        ).order_by('-started_at').first()
        if last is not None:
            has_any_result = True
            if not last.status:
                return False
    return True if has_any_result else None


def get_floor_status(floor):
    from mappy.models import Device
    devices = Device.objects.filter(floor=floor, visible_on_map=True)
    if not devices.exists():
        return None
    has_any = False
    for device in devices:
        status = get_device_status(device)
        if status is not None:
            has_any = True
            if status is False:
                return False
    return True if has_any else None


def get_office_status(office):
    from mappy.models import Floor
    has_any = False
    for floor in Floor.objects.filter(office=office):
        status = get_floor_status(floor)
        if status is not None:
            has_any = True
            if status is False:
                return False
    return True if has_any else None


def get_city_status(city):
    from mappy.models import Office
    has_any = False
    for office in Office.objects.filter(city=city):
        status = get_office_status(office)
        if status is not None:
            has_any = True
            if status is False:
                return False
    return True if has_any else None


def get_region_status(region):
    from mappy.models import City
    has_any = False
    for city in City.objects.filter(region=region):
        status = get_city_status(city)
        if status is not None:
            has_any = True
            if status is False:
                return False
    return True if has_any else None


def poll_floor(floor, protocol_id=None):
    from mappy.models import Device
    results = {}
    for device in Device.objects.filter(floor=floor, visible_on_map=True):
        results[device.id] = poll_device(device, protocol_id)
    return results


def poll_office(office, protocol_id=None):
    from mappy.models import Floor
    results = {}
    for floor in Floor.objects.filter(office=office):
        results.update(poll_floor(floor, protocol_id))
    return results


def poll_city(city, protocol_id=None):
    from mappy.models import Office
    results = {}
    for office in Office.objects.filter(city=city):
        results.update(poll_office(office, protocol_id))
    return results


def poll_region(region, protocol_id=None):
    from mappy.models import City
    results = {}
    for city in City.objects.filter(region=region):
        results.update(poll_city(city, protocol_id))
    return results
