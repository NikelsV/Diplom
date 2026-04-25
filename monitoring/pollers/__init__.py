# Auto-import all pollers so they register themselves
from .base import registry  # noqa
from . import icmp  # noqa
from . import snmp_v2c  # noqa
# Добавляйте новые поллеры здесь:
# from . import http_check
