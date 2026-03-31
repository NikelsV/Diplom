"""
Объединение нескольких регионов карты в один.

Использование:
    python manage.py merge_regions r5 r12 r47 --name "Архангельская область"
    python manage.py merge_regions r5 r12 r47 --dry-run

Что делает:
  SVG: у secondary path'ов меняет data-fill на primary id,
       добавляет data-group="primary_id" ко всем path'ам группы.
  БД:  переносит города из secondary в primary, удаляет secondary.
"""

import os
import re
from django.core.management.base import BaseCommand
from django.conf import settings


class Command(BaseCommand):
    help = 'Объединить несколько регионов карты в один'

    def add_arguments(self, parser):
        parser.add_argument('ids', nargs='+', type=str,
                            help='ID регионов (r1, r2, ...). Первый — основной.')
        parser.add_argument('--name', type=str, default=None,
                            help='Новое название объединённого региона')
        parser.add_argument('--dry-run', action='store_true',
                            help='Только показать что будет сделано')

    def handle(self, *args, **options):
        ids = options['ids']
        new_name = options['name']
        dry_run = options['dry_run']

        if len(ids) < 2:
            self.stderr.write('Нужно минимум 2 ID')
            return

        primary_id = ids[0]
        secondary_ids = ids[1:]

        self.stdout.write(f'Объединение: {", ".join(ids)} → основной: {primary_id}')

        # ---- 1. SVG ----
        svg_path = os.path.join(
            settings.BASE_DIR, 'mappy', 'static', 'mappy', 'svg', 'russia_map.svg'
        )
        with open(svg_path, 'r') as f:
            svg = f.read()

        changes = 0

        for sid in secondary_ids:
            # Заменить data-fill="rX" → data-fill="rPRIMARY"
            old = f'data-fill="{sid}"'
            new = f'data-fill="{primary_id}"'
            if old in svg:
                svg = svg.replace(old, new)
                changes += 1
                self.stdout.write(f'  SVG: data-fill "{sid}" → "{primary_id}"')

        # Добавить data-group ко всем path'ам с data-fill="primary_id"
        # Сначала убрать старые data-group у этих path'ов
        svg = re.sub(
            rf'(data-fill="{re.escape(primary_id)}")\s*data-group="[^"]*"',
            r'\1',
            svg
        )
        # Добавить data-group
        svg = svg.replace(
            f'data-fill="{primary_id}"',
            f'data-fill="{primary_id}" data-group="{primary_id}"'
        )

        if not dry_run:
            with open(svg_path, 'w') as f:
                f.write(svg)
            self.stdout.write(self.style.SUCCESS(f'  SVG сохранён ({changes} path перекрашено)'))
        else:
            self.stdout.write(f'  [DRY RUN] SVG: {changes} path будет изменено')

        # ---- 2. БД ----
        from mappy.models import Region, City

        primary_region = Region.objects.filter(svg_id=primary_id).first()
        if not primary_region:
            self.stderr.write(f'Регион svg_id="{primary_id}" не найден в БД')
            return

        if new_name:
            if not dry_run:
                primary_region.name = new_name
                primary_region.save()
            self.stdout.write(f'  БД: переименован → "{new_name}"')

        for sid in secondary_ids:
            sec = Region.objects.filter(svg_id=sid).first()
            if not sec:
                self.stdout.write(f'  БД: {sid} не найден, пропуск')
                continue
            cities = City.objects.filter(region=sec)
            cnt = cities.count()
            if not dry_run:
                if cnt > 0:
                    cities.update(region=primary_region)
                    self.stdout.write(f'  БД: {cnt} город(ов) {sid} → {primary_id}')
                sec.delete()
            self.stdout.write(f'  БД: {sid} ("{sec.name}") удалён')

        if dry_run:
            self.stdout.write(self.style.WARNING('\n[DRY RUN] Изменения НЕ применены'))
        else:
            self.stdout.write(self.style.SUCCESS('\nГотово!'))
