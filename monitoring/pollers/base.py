"""
Базовый класс поллера и реестр.

Поллер = Python-код который умеет опрашивать устройство по конкретному протоколу.
Метаданные (название, схема параметров, дефолты) хранятся в БД (MonitorProtocol).

Добавление нового протокола:
  1. Создать файл monitoring/pollers/my_protocol.py
  2. Наследовать от BasePoller, задать protocol = 'my_protocol'
  3. Реализовать poll(ip_address, params) → PollResult
  4. Добавить import в pollers/__init__.py
  5. В Django Admin → Протоколы мониторинга → добавить запись с poller_id='my_protocol'
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class PollResult:
    """Результат одного опроса."""
    success: bool
    details: dict = None

    def __post_init__(self):
        if self.details is None:
            self.details = {}


class BasePoller(ABC):
    """Базовый класс поллера. Только protocol и poll()."""

    protocol: str = ''  # должен совпадать с MonitorProtocol.poller_id в БД

    @abstractmethod
    def poll(self, ip_address: str, params: dict) -> PollResult:
        """
        Выполнить опрос устройства.
        params — итоговые параметры (default ← global ← device).
        """
        pass


class PollerRegistry:
    """Реестр поллеров. Связывает poller_id с Python-классом."""

    def __init__(self):
        self._pollers: dict[str, BasePoller] = {}

    def register(self, poller_class: type):
        """Зарегистрировать поллер."""
        instance = poller_class()
        if not instance.protocol:
            raise ValueError(f'{poller_class.__name__} must define protocol')
        self._pollers[instance.protocol] = instance
        return poller_class

    def get(self, poller_id: str):
        """Получить поллер по ID. None если не зарегистрирован."""
        return self._pollers.get(poller_id)

    def available_ids(self) -> list:
        """Список зарегистрированных poller_id."""
        return list(self._pollers.keys())


registry = PollerRegistry()
