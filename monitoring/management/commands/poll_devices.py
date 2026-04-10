"""
Периодический опрос устройств.

Запуск однократно:
    python manage.py poll_devices

Запуск в цикле (каждые 5 минут):
    python manage.py poll_devices --loop --interval 300
"""

import time
from django.core.management.base import BaseCommand
from monitoring.models import DeviceMonitorConfig
from monitoring.services import poll_device
from mappy.models import Device


class Command(BaseCommand):
    help = 'Опрос всех устройств с настроенным мониторингом'

    def add_arguments(self, parser):
        parser.add_argument('--loop', action='store_true', help='Запускать в бесконечном цикле')
        parser.add_argument('--interval', type=int, default=300, help='Интервал между циклами в секундах (default: 300)')

    def handle(self, *args, **options):
        loop = options['loop']
        interval = options['interval']

        if loop:
            self.stdout.write(f'Запуск периодического опроса каждые {interval} сек. Ctrl+C для остановки.')

        while True:
            self._run_poll()
            if not loop:
                break
            self.stdout.write(f'Следующий опрос через {interval} сек...')
            time.sleep(interval)

    def _run_poll(self):
        # Найти все устройства с хотя бы одним включённым мониторингом
        device_ids = DeviceMonitorConfig.objects.filter(
            enabled=True
        ).values_list('device_id', flat=True).distinct()

        devices = Device.objects.filter(id__in=device_ids)
        total = devices.count()

        if total == 0:
            self.stdout.write('Нет устройств с настроенным мониторингом.')
            return

        self.stdout.write(f'Опрос {total} устройств...')
        ok_count = 0
        fail_count = 0

        for device in devices:
            results = poll_device(device)
            for protocol, result in results.items():
                if result.success:
                    ok_count += 1
                    self.stdout.write(f'  ✓ {device.name} ({device.ip_address}) [{protocol}]')
                else:
                    fail_count += 1
                    err = result.details.get('error', 'unknown')
                    self.stdout.write(self.style.ERROR(
                        f'  ✗ {device.name} ({device.ip_address}) [{protocol}]: {err}'
                    ))

        self.stdout.write(self.style.SUCCESS(
            f'Итого: {ok_count} OK, {fail_count} FAIL из {total} устройств'
        ))
