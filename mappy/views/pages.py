from django.shortcuts import render, get_object_or_404
from ..models import Region, Floor


def map_view(request):
    """Главная страница — интерактивная карта России"""
    return render(request, 'mappy/map.html')


def region_view(request, region_id):
    """Страница карты области — города, офисы, этажи"""
    region = get_object_or_404(Region, pk=region_id)
    return render(request, 'mappy/region.html', {'region_id': region.id})


def floor_view(request, floor_id):
    """Страница редактора этажа"""
    floor = get_object_or_404(Floor, pk=floor_id)
    return render(request, 'mappy/floor.html', {'floor_id': floor.id})


def device_list_view(request):
    """Страница списка устройств"""
    return render(request, 'mappy/device_list.html')
