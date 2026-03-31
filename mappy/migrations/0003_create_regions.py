from django.db import migrations


def create_regions(apps, schema_editor):
    Region = apps.get_model('mappy', 'Region')
    Region.objects.all().delete()
    for i in range(1, 154):
        Region.objects.create(name=f'Регион {i}', svg_id=f'r{i}')


def delete_regions(apps, schema_editor):
    Region = apps.get_model('mappy', 'Region')
    Region.objects.filter(svg_id__in=[f'r{i}' for i in range(1, 154)]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('mappy', '0002_connection_waypoints_devicetype_builtin_icon_and_more'),
    ]
    operations = [
        migrations.RunPython(create_regions, delete_regions),
    ]
