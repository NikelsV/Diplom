from django.db import models


class MonitorProtocol(models.Model):
    """
    Зарегистрированный протокол мониторинга.
    Администратор добавляет через Django Admin.
    
    poller_id — идентификатор класса поллера в Python (icmp, snmp, http, tcp, ...).
    Должен совпадать с BasePoller.protocol у зарегистрированного поллера.
    
    param_schema — описание параметров для UI, формат JSON:
    [
        {"key": "timeout", "label": "Таймаут (сек)", "type": "number", "default": 2},
        {"key": "count",   "label": "Кол-во пакетов", "type": "number", "default": 3},
        {"key": "community","label": "Community string","type": "string","default": "public"}
    ]
    Типы: number, string, boolean.
    
    default_params — значения по умолчанию для новых устройств:
    {"timeout": 2, "count": 3}
    """
    poller_id = models.CharField(
        max_length=50, unique=True, verbose_name='ID поллера',
        help_text='Идентификатор класса поллера (icmp, snmp, http, tcp...)'
    )
    display_name = models.CharField(max_length=100, verbose_name='Название')
    description = models.TextField(blank=True, verbose_name='Описание')
    enabled = models.BooleanField(default=True, verbose_name='Активен',
                                  help_text='Если выключен — протокол не предлагается при настройке')
    param_schema = models.JSONField(
        default=list, blank=True, verbose_name='Схема параметров',
        help_text='JSON-массив описаний полей: [{"key","label","type","default"}, ...]'
    )
    default_params = models.JSONField(
        default=dict, blank=True, verbose_name='Параметры по умолчанию',
        help_text='JSON-словарь значений по умолчанию: {"timeout": 2, ...}'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Протокол мониторинга'
        verbose_name_plural = 'Протоколы мониторинга'
        ordering = ['display_name']

    def __str__(self):
        return f'{self.display_name} ({self.poller_id})'


class GlobalMonitorSettings(models.Model):
    """
    Глобальные настройки для конкретного протокола мониторинга.
    Применяются ко всем устройствам, если у устройства нет своих.
    
    Одна запись на протокол.
    """
    protocol = models.OneToOneField(
        MonitorProtocol, on_delete=models.CASCADE,
        related_name='global_settings', verbose_name='Протокол'
    )
    params = models.JSONField(
        default=dict, blank=True, verbose_name='Глобальные параметры',
        help_text='JSON-словарь параметров. Переопределяют default_params протокола.'
    )
    auto_poll_enabled = models.BooleanField(
        default=True, verbose_name='Автоматический опрос',
        help_text='Участвует ли этот протокол в периодическом сканировании'
    )
    poll_interval = models.IntegerField(
        default=300, verbose_name='Интервал опроса (сек)',
        help_text='Интервал автоматического опроса для этого протокола'
    )

    class Meta:
        verbose_name = 'Глобальные настройки мониторинга'
        verbose_name_plural = 'Глобальные настройки мониторинга'

    def __str__(self):
        return f'Настройки: {self.protocol.display_name}'


class DeviceMonitorConfig(models.Model):
    """
    Настройка мониторинга конкретного устройства конкретным протоколом.
    params переопределяют глобальные настройки/default_params.
    """
    device = models.ForeignKey(
        'mappy.Device', on_delete=models.CASCADE,
        related_name='monitor_configs', verbose_name='Устройство'
    )
    protocol = models.ForeignKey(
        MonitorProtocol, on_delete=models.CASCADE,
        related_name='device_configs', verbose_name='Протокол'
    )
    enabled = models.BooleanField(default=True, verbose_name='Включён')
    params = models.JSONField(
        default=dict, blank=True, verbose_name='Параметры устройства',
        help_text='Переопределяют глобальные параметры протокола'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Настройка мониторинга устройства'
        verbose_name_plural = 'Настройки мониторинга устройств'
        unique_together = ('device', 'protocol')

    def get_effective_params(self):
        """Итоговые параметры: default_params ← global_settings ← device params."""
        result = dict(self.protocol.default_params)
        try:
            gs = self.protocol.global_settings
            result.update(gs.params)
        except GlobalMonitorSettings.DoesNotExist:
            pass
        result.update(self.params)
        return result

    def __str__(self):
        state = 'вкл' if self.enabled else 'выкл'
        return f'{self.device.name} — {self.protocol.display_name} ({state})'


class MonitoringHistory(models.Model):
    """
    История мониторинга — периоды доступности/недоступности.
    Новая запись только при СМЕНЕ статуса.
    """
    device = models.ForeignKey(
        'mappy.Device', on_delete=models.CASCADE,
        related_name='monitoring_history', verbose_name='Устройство'
    )
    protocol = models.ForeignKey(
        MonitorProtocol, on_delete=models.CASCADE,
        related_name='history', verbose_name='Протокол'
    )
    status = models.BooleanField(verbose_name='Доступен')
    started_at = models.DateTimeField(auto_now_add=True, verbose_name='Начало периода')
    ended_at = models.DateTimeField(null=True, blank=True, verbose_name='Конец периода')
    details = models.JSONField(default=dict, blank=True, verbose_name='Детали')

    class Meta:
        verbose_name = 'Запись мониторинга'
        verbose_name_plural = 'История мониторинга'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['device', 'protocol', '-started_at']),
        ]

    def __str__(self):
        s = '✓' if self.status else '✗'
        return f'{s} {self.device.name}/{self.protocol.poller_id} с {self.started_at}'
