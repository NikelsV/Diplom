from django.shortcuts import render, get_object_or_404
from ..models import Floor


def map_view(request):
    """Главная страница — интерактивная карта России"""
    return render(request, 'mappy/map.html')


def floor_view(request, floor_id):
    """Страница редактора этажа"""
    floor = get_object_or_404(Floor, pk=floor_id)
    return render(request, 'mappy/floor.html', {'floor_id': floor.id})


def device_list_view(request):
    """Страница списка устройств"""
    return render(request, 'mappy/device_list.html')
