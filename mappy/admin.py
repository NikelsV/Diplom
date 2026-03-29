from django.contrib import admin
from .models import Region, City, Office, Floor, DeviceType, Device, Connection

admin.site.register(Region)
admin.site.register(City)
admin.site.register(Office)
admin.site.register(Floor)
admin.site.register(DeviceType)
admin.site.register(Device)
admin.site.register(Connection)