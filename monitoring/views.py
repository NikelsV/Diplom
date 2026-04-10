from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from .models import MonitorProtocol, GlobalMonitorSettings, DeviceMonitorConfig, MonitoringHistory
from .serializers import (
    MonitorProtocolSerializer, GlobalMonitorSettingsSerializer,
    DeviceMonitorConfigSerializer, MonitoringHistorySerializer,
)
from . import services
from .pollers.base import registry
from mappy.models import Device, Floor, Office, City, Region


class MonitorProtocolViewSet(viewsets.ModelViewSet):
    """Протоколы мониторинга (зарегистрированные в БД)."""
    queryset = MonitorProtocol.objects.filter(enabled=True)
    serializer_class = MonitorProtocolSerializer


class GlobalMonitorSettingsViewSet(viewsets.ModelViewSet):
    """Глобальные настройки мониторинга по протоколам."""
    queryset = GlobalMonitorSettings.objects.all()
    serializer_class = GlobalMonitorSettingsSerializer

    def get_queryset(self):
        qs = GlobalMonitorSettings.objects.all()
        protocol_id = self.request.query_params.get('protocol')
        if protocol_id:
            qs = qs.filter(protocol_id=protocol_id)
        return qs


class DeviceMonitorConfigViewSet(viewsets.ModelViewSet):
    """Настройки мониторинга устройств."""
    queryset = DeviceMonitorConfig.objects.all()
    serializer_class = DeviceMonitorConfigSerializer

    def get_queryset(self):
        qs = DeviceMonitorConfig.objects.all()
        device_id = self.request.query_params.get('device')
        if device_id:
            qs = qs.filter(device_id=device_id)
        return qs


@api_view(['GET'])
def available_protocols(request):
    """Список активных протоколов с param_schema и default_params."""
    protocols = MonitorProtocol.objects.filter(enabled=True)
    data = []
    for p in protocols:
        # Merge default_params with global settings
        effective_defaults = dict(p.default_params)
        try:
            gs = p.global_settings
            effective_defaults.update(gs.params)
        except GlobalMonitorSettings.DoesNotExist:
            pass
        data.append({
            'id': p.id,
            'poller_id': p.poller_id,
            'display_name': p.display_name,
            'param_schema': p.param_schema,
            'default_params': effective_defaults,
            'has_poller': registry.get(p.poller_id) is not None,
        })
    return Response(data)


def _get_protocol_filter(request):
    """Извлечь protocol (poller_id) из query params."""
    return request.query_params.get('protocol') or request.data.get('protocol') or None


@api_view(['POST'])
def poll_device_view(request, device_id):
    device = get_object_or_404(Device, pk=device_id)
    protocol_id = _get_protocol_filter(request)
    results = services.poll_device(device, protocol_id)
    return Response({
        'device_id': device.id,
        'results': {
            proto: {'success': r.success, 'details': r.details}
            for proto, r in results.items()
        }
    })


@api_view(['POST'])
def poll_floor_view(request, floor_id):
    floor = get_object_or_404(Floor, pk=floor_id)
    protocol_id = _get_protocol_filter(request)
    services.poll_floor(floor, protocol_id)
    return Response({'status': 'ok', 'floor_id': floor.id})


@api_view(['POST'])
def poll_office_view(request, office_id):
    office = get_object_or_404(Office, pk=office_id)
    protocol_id = _get_protocol_filter(request)
    services.poll_office(office, protocol_id)
    return Response({'status': 'ok', 'office_id': office.id})


@api_view(['POST'])
def poll_city_view(request, city_id):
    city = get_object_or_404(City, pk=city_id)
    protocol_id = _get_protocol_filter(request)
    services.poll_city(city, protocol_id)
    return Response({'status': 'ok', 'city_id': city.id})


@api_view(['POST'])
def poll_region_view(request, region_id):
    region = get_object_or_404(Region, pk=region_id)
    protocol_id = _get_protocol_filter(request)
    services.poll_region(region, protocol_id)
    return Response({'status': 'ok', 'region_id': region.id})


@api_view(['GET'])
def device_status_view(request, device_id):
    device = get_object_or_404(Device, pk=device_id)
    return Response({'device_id': device.id, 'status': services.get_device_status(device)})


@api_view(['GET'])
def floor_status_view(request, floor_id):
    floor = get_object_or_404(Floor, pk=floor_id)
    devices = Device.objects.filter(floor=floor)
    device_statuses = {}
    for d in devices:
        device_statuses[d.id] = services.get_device_status(d)
    return Response({
        'floor_id': floor.id,
        'status': services.get_floor_status(floor),
        'devices': device_statuses,
    })


@api_view(['GET'])
def region_status_view(request, region_id):
    region = get_object_or_404(Region, pk=region_id)
    cities_data = []
    for city in City.objects.filter(region=region):
        offices_data = []
        for office in Office.objects.filter(city=city):
            floors_data = []
            for floor in Floor.objects.filter(office=office):
                floors_data.append({
                    'id': floor.id, 'number': floor.number,
                    'status': services.get_floor_status(floor),
                })
            offices_data.append({
                'id': office.id, 'name': office.name,
                'status': services.get_office_status(office),
                'floors': floors_data,
            })
        cities_data.append({
            'id': city.id, 'name': city.name,
            'status': services.get_city_status(city),
            'offices': offices_data,
        })
    return Response({
        'region_id': region.id,
        'status': services.get_region_status(region),
        'cities': cities_data,
    })
