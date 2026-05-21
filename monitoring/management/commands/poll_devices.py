"""
Периодический опрос устройств.

Используется как самостоятельный процесс (в эксплуатации запускается
в отдельном контейнере) либо для ручного запуска при разработке.

Однократный запуск:
    python manage.py poll_devices

Бесконечный цикл с интервалом по умолчанию (5 минут):
    python manage.py poll_devices --loop

Бесконечный цикл с заданным интервалом:
    python manage.py poll_devices --loop --interval 600

Команда делегирует фактическую работу сервисному слою
(monitoring.services.poll_all_active_devices), сама занимаясь только
циклом, ожиданием и форматированным выводом в stdout.
"""

import time
from django.core.management.base import BaseCommand
from monitoring.services import poll_all_active_devices


class Command(BaseCommand):
    help = 'Опрос всех устройств с настроенным мониторингом'

    def add_arguments(self, parser):
        parser.add_argument(
            '--loop', action='store_true',
            help='Запускать в бесконечном цикле'
        )
        parser.add_argument(
            '--interval', type=int, default=300,
            help='Интервал между циклами в секундах (default: 300)'
        )

    def handle(self, *args, **options):
        loop = options['loop']
        interval = options['interval']

        if loop:
            self.stdout.write(
                f'Запуск периодического опроса каждые {interval} сек. '
                f'Ctrl+C для остановки.'
            )

        while True:
            self._run_once()
            if not loop:
                break
            self.stdout.write(f'Следующий опрос через {interval} сек...')
            time.sleep(interval)

    def _run_once(self):
        """Одна итерация опроса с построчным выводом результатов."""
        total, ok_count, fail_count, per_device = poll_all_active_devices()

        if total == 0:
            self.stdout.write('Нет устройств с настроенным мониторингом.')
            return

        self.stdout.write(f'Опрос {total} устройств...')

        for entry in per_device:
            device = entry['device']
            for protocol_id, result in entry['results'].items():
                if result.success:
                    self.stdout.write(
                        f'  ✓ {device.name} ({device.ip_address}) [{protocol_id}]'
                    )
                else:
                    err = result.details.get('error', 'unknown')
                    self.stdout.write(self.style.ERROR(
                        f'  ✗ {device.name} ({device.ip_address}) '
                        f'[{protocol_id}]: {err}'
                    ))

        self.stdout.write(self.style.SUCCESS(
            f'Итого: {ok_count} OK, {fail_count} FAIL из {total} устройств'
        ))
