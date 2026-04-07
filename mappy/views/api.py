import os
from django.conf import settings
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from ..models import Region, City, Office, Floor, DeviceType, Device, Connection
from ..serializers import (
    RegionSerializer, CitySerializer, OfficeSerializer, FloorSerializer,
    DeviceTypeSerializer, DeviceSerializer, ConnectionSerializer,
)


class RegionViewSet(viewsets.ModelViewSet):
    queryset = Region.objects.all()
    serializer_class = RegionSerializer


class CityViewSet(viewsets.ModelViewSet):
    queryset = City.objects.all()
    serializer_class = CitySerializer

    def get_queryset(self):
        qs = City.objects.all()
        region_id = self.request.query_params.get('region')
        if region_id:
            qs = qs.filter(region_id=region_id)
        return qs


class OfficeViewSet(viewsets.ModelViewSet):
    queryset = Office.objects.all()
    serializer_class = OfficeSerializer

    def get_queryset(self):
        qs = Office.objects.all()
        city_id = self.request.query_params.get('city')
        if city_id:
            qs = qs.filter(city_id=city_id)
        return qs


class FloorViewSet(viewsets.ModelViewSet):
    queryset = Floor.objects.all()
    serializer_class = FloorSerializer

    def get_queryset(self):
        qs = Floor.objects.all()
        office_id = self.request.query_params.get('office')
        if office_id:
            qs = qs.filter(office_id=office_id)
        return qs

    @action(detail=True, methods=['post'], url_path='upload-map')
    def upload_map(self, request, pk=None):
        """Загрузка карты этажа"""
        floor = self.get_object()
        if 'map_image' not in request.FILES:
            return Response({'error': 'Файл не передан'}, status=status.HTTP_400_BAD_REQUEST)
        floor.map_image = request.FILES['map_image']
        floor.save()
        return Response(FloorSerializer(floor).data)


class DeviceTypeViewSet(viewsets.ModelViewSet):
    queryset = DeviceType.objects.all()
    serializer_class = DeviceTypeSerializer


class DeviceViewSet(viewsets.ModelViewSet):
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer

    def get_queryset(self):
        qs = Device.objects.all()
        floor_id = self.request.query_params.get('floor')
        if floor_id:
            qs = qs.filter(floor_id=floor_id)
        return qs

    @action(detail=True, methods=['patch'], url_path='move')
    def move(self, request, pk=None):
        """Сохранение позиции устройства на канвасе"""
        device = self.get_object()
        x = request.data.get('x')
        y = request.data.get('y')
        if x is None or y is None:
            return Response({'error': 'Нужно передать x и y'}, status=status.HTTP_400_BAD_REQUEST)
        device.x = x
        device.y = y
        device.save()
        return Response(DeviceSerializer(device).data)


class ConnectionViewSet(viewsets.ModelViewSet):
    queryset = Connection.objects.all()
    serializer_class = ConnectionSerializer

    def get_queryset(self):
        qs = Connection.objects.all()
        floor_id = self.request.query_params.get('floor')
        if floor_id:
            qs = qs.filter(device_a__floor_id=floor_id)
        return qs

    @action(detail=True, methods=['patch'], url_path='waypoints')
    def update_waypoints(self, request, pk=None):
        """Сохранение точек маршрута стрелки"""
        connection = self.get_object()
        waypoints = request.data.get('waypoints', [])
        if not isinstance(waypoints, list):
            return Response(
                {'error': 'waypoints должен быть массивом'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        clean = []
        for wp in waypoints:
            if isinstance(wp, dict) and 'x' in wp and 'y' in wp:
                try:
                    clean.append({'x': float(wp['x']), 'y': float(wp['y'])})
                except (ValueError, TypeError):
                    continue
        connection.waypoints = clean[:65]
        connection.save()
        return Response(ConnectionSerializer(connection).data)


@api_view(['GET'])
def builtin_icons(request):
    """Возвращает список предустановленных иконок устройств"""
    icons_dir = os.path.join(settings.BASE_DIR, 'mappy', 'static', 'mappy', 'icons')
    if not os.path.exists(icons_dir):
        return Response([])
    files = [
        f for f in os.listdir(icons_dir)
        if f.lower().endswith(('.png', '.svg', '.jpg'))
    ]
    return Response([
        {
            'name': os.path.splitext(f)[0],
            'filename': f,
            'url': request.build_absolute_uri(f'/static/mappy/icons/{f}'),
        }
        for f in sorted(files)
    ])
