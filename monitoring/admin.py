from django.contrib import admin
from .models import MonitorProtocol, GlobalMonitorSettings, DeviceMonitorConfig, MonitoringHistory


class GlobalMonitorSettingsInline(admin.StackedInline):
    model = GlobalMonitorSettings
    extra = 0
    max_num = 1


@admin.register(MonitorProtocol)
class MonitorProtocolAdmin(admin.ModelAdmin):
    list_display = ['display_name', 'poller_id', 'enabled', 'has_poller', 'created_at']
    list_filter = ['enabled']
    inlines = [GlobalMonitorSettingsInline]
    fieldsets = (
        (None, {'fields': ('poller_id', 'display_name', 'description', 'enabled')}),
        ('Параметры', {
            'fields': ('param_schema', 'default_params'),
            'description': (
                '<b>param_schema</b> — JSON массив полей для UI:<br>'
                '<code>[{"key": "timeout", "label": "Таймаут (сек)", "type": "number", "default": 2}]</code><br>'
                'Типы: number, string, boolean<br><br>'
                '<b>default_params</b> — JSON словарь значений по умолчанию:<br>'
                '<code>{"timeout": 2, "count": 3}</code>'
            ),
        }),
    )

    @admin.display(boolean=True, description='Поллер найден')
    def has_poller(self, obj):
        from .pollers.base import registry
        return registry.get(obj.poller_id) is not None


@admin.register(GlobalMonitorSettings)
class GlobalMonitorSettingsAdmin(admin.ModelAdmin):
    list_display = ['protocol', 'auto_poll_enabled', 'poll_interval']


@admin.register(DeviceMonitorConfig)
class DeviceMonitorConfigAdmin(admin.ModelAdmin):
    list_display = ['device', 'protocol', 'enabled', 'updated_at']
    list_filter = ['protocol', 'enabled']


@admin.register(MonitoringHistory)
class MonitoringHistoryAdmin(admin.ModelAdmin):
    list_display = ['device', 'protocol', 'status', 'started_at', 'ended_at']
    list_filter = ['protocol', 'status']
    readonly_fields = ['started_at']
