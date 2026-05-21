import os
from django.apps import AppConfig


class MonitoringConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'monitoring'
    verbose_name = 'Мониторинг'

    def ready(self):
        """
        Запуск фонового потока мониторинга при старте Django.

        Поток запускается ТОЛЬКО при двух одновременных условиях:

        1. Переменная окружения ENABLE_BACKGROUND_POLLER установлена в "true".
           Это нужно, чтобы при работе в продакшене за фоновый опрос отвечал
           отдельный сервис (контейнер webmap-poller), а не gunicorn-воркеры
           основного веб-приложения. Иначе при N воркерах опрос идёт в N
           параллельных потоков, что приводит к N-кратному опросу каждого
           устройства и конфликтам при обновлении истории.

        2. Переменная окружения RUN_MAIN установлена в "true".
           Это переменная, которую Django runserver устанавливает в дочернем
           процессе с автоперезагрузкой. Без этой проверки при запуске
           runserver поток запустится дважды (в watcher- и worker-процессах).
           В gunicorn эта переменная не используется, поэтому проверка
           эффективна только при работе через runserver.

        При запуске CLI-команды (например, manage.py migrate) переменные
        обычно не установлены, и поток не стартует — что и требуется.
        """
        if os.environ.get('ENABLE_BACKGROUND_POLLER', '').lower() not in ('true', '1', 'yes'):
            return

        if os.environ.get('RUN_MAIN') != 'true':
            return

        import threading
        from .background import start_background_polling
        t = threading.Thread(target=start_background_polling, daemon=True)
        t.start()
