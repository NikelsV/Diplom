from django.apps import AppConfig


class MonitoringConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'monitoring'
    verbose_name = 'Мониторинг'

    def ready(self):
        """Запуск фонового потока мониторинга при старте сервера."""
        import threading
        import os

        # Запускаем только в основном процессе (не в авто-перезагрузке)
        if os.environ.get('RUN_MAIN') != 'true':
            return

        from .background import start_background_polling
        t = threading.Thread(target=start_background_polling, daemon=True)
        t.start()
