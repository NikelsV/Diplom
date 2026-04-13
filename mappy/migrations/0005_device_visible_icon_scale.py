from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mappy', '0004_region_map_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='device',
            name='visible_on_map',
            field=models.BooleanField(default=True, verbose_name='Отображать на карте'),
        ),
        migrations.AddField(
            model_name='device',
            name='icon_scale',
            field=models.FloatField(default=1.0, verbose_name='Масштаб иконки'),
        ),
    ]
