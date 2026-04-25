from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mappy', '0005_device_visible_icon_scale'),
    ]

    operations = [
        migrations.AlterField(
            model_name='connection',
            name='line_type',
            field=models.CharField(
                choices=[('line', 'Линия'), ('arrow', 'Стрелка')],
                default='line',
                max_length=10,
                verbose_name='Тип линии',
            ),
        ),
    ]
