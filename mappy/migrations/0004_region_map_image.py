from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mappy', '0003_create_regions'),
    ]

    operations = [
        migrations.AddField(
            model_name='region',
            name='map_image',
            field=models.ImageField(blank=True, null=True, upload_to='regions/', verbose_name='Карта области'),
        ),
    ]
