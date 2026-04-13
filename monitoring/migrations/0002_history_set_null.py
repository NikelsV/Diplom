from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('monitoring', '0001_initial'),
        ('mappy', '0005_device_visible_icon_scale'),
    ]

    operations = [
        migrations.AlterField(
            model_name='monitoringhistory',
            name='device',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='monitoring_history',
                to='mappy.device',
                verbose_name='Устройство',
            ),
        ),
    ]
