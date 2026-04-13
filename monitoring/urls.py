from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'protocols', views.MonitorProtocolViewSet)
router.register(r'global-settings', views.GlobalMonitorSettingsViewSet)
router.register(r'monitor-configs', views.DeviceMonitorConfigViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('available-protocols/', views.available_protocols),
    path('poll/device/<int:device_id>/', views.poll_device_view),
    path('poll/floor/<int:floor_id>/', views.poll_floor_view),
    path('poll/office/<int:office_id>/', views.poll_office_view),
    path('poll/city/<int:city_id>/', views.poll_city_view),
    path('poll/region/<int:region_id>/', views.poll_region_view),
    path('status/device/<int:device_id>/', views.device_status_view),
    path('status/floor/<int:floor_id>/', views.floor_status_view),
    path('status/region/<int:region_id>/', views.region_status_view),
    path('status/all-regions/', views.all_regions_status_view),
    path('history/', views.history_list_view),
    path('problem-devices/', views.problem_devices_view),
]
