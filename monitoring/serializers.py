from rest_framework import serializers
from .models import MonitorProtocol, GlobalMonitorSettings, DeviceMonitorConfig, MonitoringHistory


class MonitorProtocolSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonitorProtocol
        fields = '__all__'


class GlobalMonitorSettingsSerializer(serializers.ModelSerializer):
    protocol_name = serializers.CharField(source='protocol.display_name', read_only=True)

    class Meta:
        model = GlobalMonitorSettings
        fields = '__all__'


class DeviceMonitorConfigSerializer(serializers.ModelSerializer):
    protocol_name = serializers.CharField(source='protocol.display_name', read_only=True)
    poller_id = serializers.CharField(source='protocol.poller_id', read_only=True)
    param_schema = serializers.JSONField(source='protocol.param_schema', read_only=True)
    effective_params = serializers.SerializerMethodField()

    class Meta:
        model = DeviceMonitorConfig
        fields = '__all__'

    def get_effective_params(self, obj):
        return obj.get_effective_params()


class MonitoringHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MonitoringHistory
        fields = '__all__'
