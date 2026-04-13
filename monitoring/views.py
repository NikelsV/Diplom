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
    """Синхронный опрос одного устройства — результат сразу."""
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


import threading

def _run_in_thread(fn, *args):
    """Запустить функцию в отдельном потоке."""
    t = threading.Thread(target=fn, args=args, daemon=True)
    t.start()


@api_view(['POST'])
def poll_floor_view(request, floor_id):
    floor = get_object_or_404(Floor, pk=floor_id)
    protocol_id = _get_protocol_filter(request)
    _run_in_thread(services.poll_floor, floor, protocol_id)
    return Response({'status': 'started', 'floor_id': floor.id})


@api_view(['POST'])
def poll_office_view(request, office_id):
    office = get_object_or_404(Office, pk=office_id)
    protocol_id = _get_protocol_filter(request)
    _run_in_thread(services.poll_office, office, protocol_id)
    return Response({'status': 'started', 'office_id': office.id})


@api_view(['POST'])
def poll_city_view(request, city_id):
    city = get_object_or_404(City, pk=city_id)
    protocol_id = _get_protocol_filter(request)
    _run_in_thread(services.poll_city, city, protocol_id)
    return Response({'status': 'started', 'city_id': city.id})


@api_view(['POST'])
def poll_region_view(request, region_id):
    region = get_object_or_404(Region, pk=region_id)
    protocol_id = _get_protocol_filter(request)
    _run_in_thread(services.poll_region, region, protocol_id)
    return Response({'status': 'started', 'region_id': region.id})


@api_view(['GET'])
def device_status_view(request, device_id):
    device = get_object_or_404(Device, pk=device_id)
    return Response({'device_id': device.id, 'status': services.get_device_status(device)})


@api_view(['GET'])
def floor_status_view(request, floor_id):
    floor = get_object_or_404(Floor, pk=floor_id)
    devices = Device.objects.filter(floor=floor, visible_on_map=True)
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

@api_view(['GET'])
def all_regions_status_view(request):
    """Статусы ВСЕХ регионов одним запросом (для карты России)."""
    data = {}
    for region in Region.objects.all():
        status = services.get_region_status(region)
        if status is not None:
            data[region.id] = status
    return Response(data)


@api_view(['GET'])
def history_list_view(request):
    """Список записей истории мониторинга с фильтрацией и сортировкой."""
    qs = MonitoringHistory.objects.select_related('device', 'protocol').all()

    # Filters
    device_id = request.query_params.get('device')
    if device_id:
        qs = qs.filter(device_id=device_id)

    protocol_id = request.query_params.get('protocol')
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)

    status = request.query_params.get('status')
    if status is not None and status != '':
        qs = qs.filter(status=(status.lower() in ('true', '1', 'yes')))

    # Sort
    sort_by = request.query_params.get('sort', '-started_at')
    allowed_sorts = ['started_at', '-started_at', 'ended_at', '-ended_at', 'status', '-status']
    if sort_by in allowed_sorts:
        qs = qs.order_by(sort_by)

    # Serialize manually (avoid N+1)
    data = []
    for h in qs[:500]:  # limit to 500 records
        data.append({
            'id': h.id,
            'device_id': h.device_id,
            'device_name': h.device.name if h.device else '(удалено)',
            'device_ip': h.device.ip_address if h.device else None,
            'protocol_id': h.protocol_id,
            'protocol_name': h.protocol.display_name if h.protocol else '?',
            'status': h.status,
            'started_at': h.started_at.isoformat() if h.started_at else None,
            'ended_at': h.ended_at.isoformat() if h.ended_at else None,
            'details': h.details,
        })
    return Response(data)


@api_view(['GET'])
def problem_devices_view(request):
    """Устройства с проблемами (последний статус = False) с полной иерархией."""
    from .models import DeviceMonitorConfig, MonitoringHistory
    
    # Find devices that have monitoring enabled
    device_ids = DeviceMonitorConfig.objects.filter(
        enabled=True
    ).values_list('device_id', flat=True).distinct()
    
    problems = []
    for device in Device.objects.filter(id__in=device_ids, visible_on_map=True).select_related(
        'floor__office__city__region'
    ):
        status = services.get_device_status(device)
        if status is False:
            floor = device.floor
            office = floor.office if floor else None
            city = office.city if office else None
            region = city.region if city else None
            problems.append({
                'device_id': device.id,
                'device_name': device.name,
                'ip': device.ip_address,
                'floor_id': floor.id if floor else None,
                'floor_number': floor.number if floor else None,
                'office_name': office.name if office else None,
                'city_name': city.name if city else None,
                'region_name': region.name if region else None,
            })
    return Response(problems)
