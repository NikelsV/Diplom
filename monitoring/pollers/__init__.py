# Auto-import all pollers so they register themselves
from .base import registry  # noqa
from . import icmp  # noqa
# Добавляйте новые поллеры здесь:
# from . import snmp
# from . import http_check
