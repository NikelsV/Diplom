from django.db import migrations, models
import django.db.models.deletion


def seed_icmp_protocol(apps, schema_editor):
    MonitorProtocol = apps.get_model('monitoring', 'MonitorProtocol')
    GlobalMonitorSettings = apps.get_model('monitoring', 'GlobalMonitorSettings')

    proto = MonitorProtocol.objects.create(
        poller_id='icmp',
        display_name='ICMP Ping',
        description='Проверка доступности устройства через ping (ICMP Echo)',
        enabled=True,
        param_schema=[
            {'key': 'timeout', 'label': 'Таймаут (сек)', 'type': 'number', 'default': 2},
            {'key': 'count', 'label': 'Кол-во пакетов', 'type': 'number', 'default': 3},
        ],
        default_params={'timeout': 2, 'count': 3},
    )
    GlobalMonitorSettings.objects.create(
        protocol=proto,
        params={},
        auto_poll_enabled=True,
        poll_interval=300,
    )


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('mappy', '0004_region_map_image'),
    ]

    operations = [
        migrations.CreateModel(
            name='MonitorProtocol',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('poller_id', models.CharField(help_text='Идентификатор класса поллера (icmp, snmp, http, tcp...)', max_length=50, unique=True, verbose_name='ID поллера')),
                ('display_name', models.CharField(max_length=100, verbose_name='Название')),
                ('description', models.TextField(blank=True, verbose_name='Описание')),
                ('enabled', models.BooleanField(default=True, verbose_name='Активен')),
                ('param_schema', models.JSONField(blank=True, default=list, verbose_name='Схема параметров')),
                ('default_params', models.JSONField(blank=True, default=dict, verbose_name='Параметры по умолчанию')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'verbose_name': 'Протокол мониторинга', 'verbose_name_plural': 'Протоколы мониторинга', 'ordering': ['display_name']},
        ),
        migrations.CreateModel(
            name='GlobalMonitorSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('params', models.JSONField(blank=True, default=dict, verbose_name='Глобальные параметры')),
                ('auto_poll_enabled', models.BooleanField(default=True, verbose_name='Автоматический опрос')),
                ('poll_interval', models.IntegerField(default=300, verbose_name='Интервал опроса (сек)')),
                ('protocol', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='global_settings', to='monitoring.monitorprotocol', verbose_name='Протокол')),
            ],
            options={'verbose_name': 'Глобальные настройки мониторинга', 'verbose_name_plural': 'Глобальные настройки мониторинга'},
        ),
        migrations.CreateModel(
            name='DeviceMonitorConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('enabled', models.BooleanField(default=True, verbose_name='Включён')),
                ('params', models.JSONField(blank=True, default=dict, verbose_name='Параметры устройства')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('device', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='monitor_configs', to='mappy.device', verbose_name='Устройство')),
                ('protocol', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='device_configs', to='monitoring.monitorprotocol', verbose_name='Протокол')),
            ],
            options={'verbose_name': 'Настройка мониторинга устройства', 'verbose_name_plural': 'Настройки мониторинга устройств', 'unique_together': {('device', 'protocol')}},
        ),
        migrations.CreateModel(
            name='MonitoringHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('status', models.BooleanField(verbose_name='Доступен')),
                ('started_at', models.DateTimeField(auto_now_add=True, verbose_name='Начало периода')),
                ('ended_at', models.DateTimeField(blank=True, null=True, verbose_name='Конец периода')),
                ('details', models.JSONField(blank=True, default=dict, verbose_name='Детали')),
                ('device', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='monitoring_history', to='mappy.device', verbose_name='Устройство')),
                ('protocol', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='history', to='monitoring.monitorprotocol', verbose_name='Протокол')),
            ],
            options={
                'verbose_name': 'Запись мониторинга', 'verbose_name_plural': 'История мониторинга',
                'ordering': ['-started_at'],
                'indexes': [models.Index(fields=['device', 'protocol', '-started_at'], name='monitoring_hist_idx')],
            },
        ),
        migrations.RunPython(seed_icmp_protocol, migrations.RunPython.noop),
    ]
