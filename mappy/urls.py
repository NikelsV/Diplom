from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RegionViewSet, CityViewSet, OfficeViewSet, FloorViewSet,
    DeviceTypeViewSet, DeviceViewSet, ConnectionViewSet,
    builtin_icons, map_view, region_view, floor_view, device_list_view
)

router = DefaultRouter()
router.register(r'regions', RegionViewSet)
router.register(r'cities', CityViewSet)
router.register(r'offices', OfficeViewSet)
router.register(r'floors', FloorViewSet)
router.register(r'device-types', DeviceTypeViewSet)
router.register(r'devices', DeviceViewSet)
router.register(r'connections', ConnectionViewSet)

urlpatterns = [
    # HTML pages
    path('', map_view, name='map'),
    path('region/<int:region_id>/', region_view, name='region'),
    path('floor/<int:floor_id>/', floor_view, name='floor'),
    path('devices/', device_list_view, name='device_list'),

    # API
    path('api/', include(router.urls)),
    path('api/builtin-icons/', builtin_icons),
]
