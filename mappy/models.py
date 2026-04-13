from django.db import models


class Region(models.Model):
    """Регион/область России"""
    name = models.CharField(max_length=100, verbose_name='Название')
    svg_id = models.CharField(max_length=50, verbose_name='ID на SVG-карте')
    map_image = models.ImageField(upload_to='regions/', verbose_name='Карта области', blank=True, null=True)

    class Meta:
        verbose_name = 'Регион'
        verbose_name_plural = 'Регионы'

    def __str__(self):
        return self.name


class City(models.Model):
    """Город"""
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name='cities', verbose_name='Регион')
    name = models.CharField(max_length=100, verbose_name='Название')
    x = models.FloatField(verbose_name='Позиция X на карте', default=0)
    y = models.FloatField(verbose_name='Позиция Y на карте', default=0)

    class Meta:
        verbose_name = 'Город'
        verbose_name_plural = 'Города'

    def __str__(self):
        return f'{self.name} ({self.region.name})'


class Office(models.Model):
    """Офис"""
    city = models.ForeignKey(City, on_delete=models.CASCADE, related_name='offices', verbose_name='Город')
    name = models.CharField(max_length=200, verbose_name='Название')
    address = models.CharField(max_length=300, verbose_name='Адрес', blank=True)

    class Meta:
        verbose_name = 'Офис'
        verbose_name_plural = 'Офисы'

    def __str__(self):
        return f'{self.name} — {self.city.name}'


class Floor(models.Model):
    """Этаж"""
    office = models.ForeignKey(Office, on_delete=models.CASCADE, related_name='floors', verbose_name='Офис')
    number = models.IntegerField(verbose_name='Номер этажа')
    map_image = models.ImageField(upload_to='floors/', verbose_name='Карта этажа', blank=True, null=True)

    class Meta:
        verbose_name = 'Этаж'
        verbose_name_plural = 'Этажи'
        ordering = ['number']

    def __str__(self):
        return f'Этаж {self.number} — {self.office.name}'


class DeviceType(models.Model):
    """Тип устройства (роутер, свитч, сервер и т.д.)"""
    name = models.CharField(max_length=100, verbose_name='Название')
    icon = models.ImageField(upload_to='device_icons/', verbose_name='Иконка', blank=True, null=True)
    builtin_icon = models.CharField(max_length=100, verbose_name='Встроенная иконка', blank=True)

    class Meta:
        verbose_name = 'Тип устройства'
        verbose_name_plural = 'Типы устройств'

    def __str__(self):
        return self.name


class Device(models.Model):
    """Сетевое устройство"""
    floor = models.ForeignKey(Floor, on_delete=models.CASCADE, related_name='devices', verbose_name='Этаж')
    device_type = models.ForeignKey(DeviceType, on_delete=models.SET_NULL, null=True, verbose_name='Тип устройства')

    name = models.CharField(max_length=200, verbose_name='Название')
    model = models.CharField(max_length=200, verbose_name='Модель', blank=True)
    ip_address = models.GenericIPAddressField(verbose_name='IP адрес', blank=True, null=True)
    mac_address = models.CharField(max_length=17, verbose_name='MAC адрес', blank=True)
    description = models.TextField(verbose_name='Описание', blank=True)
    responsible_person = models.CharField(max_length=200, verbose_name='Ответственное лицо', blank=True)
    contact_info = models.CharField(max_length=300, verbose_name='Контактные данные', blank=True)

    # Позиция на канвасе этажа
    x = models.FloatField(verbose_name='Позиция X', default=100)
    y = models.FloatField(verbose_name='Позиция Y', default=100)
    visible_on_map = models.BooleanField(verbose_name='Отображать на карте', default=True)
    icon_scale = models.FloatField(verbose_name='Масштаб иконки', default=1.0,
                                   help_text='1.0 = стандартный размер, 0.5 = в два раза меньше, 2.0 = в два раза больше')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Устройство'
        verbose_name_plural = 'Устройства'

    def __str__(self):
        return f'{self.name} ({self.ip_address})'


class Connection(models.Model):
    """Связь между двумя устройствами"""

    LINE = 'line'
    ARROW = 'arrow'
    LINE_TYPE_CHOICES = [
        (LINE, 'Линия'),
        (ARROW, 'Стрелка'),
    ]

    device_a = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='connections_from', verbose_name='Устройство A')
    device_b = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='connections_to', verbose_name='Устройство B')
    line_type = models.CharField(max_length=10, choices=LINE_TYPE_CHOICES, default=ARROW, verbose_name='Тип линии')
    label = models.CharField(max_length=100, verbose_name='Подпись', blank=True)
    # Сегменты маршрута — список точек излома в формате JSON
    # Пример: [{"x": 100, "y": 200}, {"x": 100, "y": 350}, {"x": 400, "y": 350}]
    # Максимум 64 сегмента = 65 точек
    waypoints = models.JSONField(verbose_name='Точки маршрута', default=list, blank=True)

    class Meta:
        verbose_name = 'Связь'
        verbose_name_plural = 'Связи'
        unique_together = ('device_a', 'device_b')

    def __str__(self):
        return f'{self.device_a.name} → {self.device_b.name}'