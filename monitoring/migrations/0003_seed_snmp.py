from django.db import migrations


def seed_snmp_protocol(apps, schema_editor):
    MonitorProtocol = apps.get_model('monitoring', 'MonitorProtocol')
    GlobalMonitorSettings = apps.get_model('monitoring', 'GlobalMonitorSettings')

    if MonitorProtocol.objects.filter(poller_id='snmp_v2c').exists():
        return

    proto = MonitorProtocol.objects.create(
        poller_id='snmp_v2c',
        display_name='SNMP v2c',
        description='Проверка доступности через SNMP v2c GET-запрос (sysDescr.0). Требует pysnmp-lextudio.',
        enabled=True,
        param_schema=[
            {'key': 'community', 'label': 'Community string', 'type': 'string', 'default': 'public'},
            {'key': 'oid', 'label': 'OID', 'type': 'string', 'default': '1.3.6.1.2.1.1.1.0'},
            {'key': 'port', 'label': 'Порт', 'type': 'number', 'default': 161},
            {'key': 'timeout', 'label': 'Таймаут (сек)', 'type': 'number', 'default': 5},
        ],
        default_params={
            'community': 'public',
            'oid': '1.3.6.1.2.1.1.1.0',
            'port': 161,
            'timeout': 5,
        },
    )
    GlobalMonitorSettings.objects.create(
        protocol=proto,
        params={},
        auto_poll_enabled=True,
        poll_interval=300,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('monitoring', '0002_history_set_null'),
    ]

    operations = [
        migrations.RunPython(seed_snmp_protocol, migrations.RunPython.noop),
    ]
