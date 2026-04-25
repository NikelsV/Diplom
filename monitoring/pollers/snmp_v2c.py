"""
SNMP v2c Poller — проверка доступности через SNMP GET.
По умолчанию запрашивает sysDescr.0 (1.3.6.1.2.1.1.1.0) — 
обязательный OID который поддерживает любое SNMP-устройство.

Требует: pip install pysnmp-lextudio
"""

from .base import BasePoller, PollResult, registry


class SNMPPoller(BasePoller):
    protocol = 'snmp_v2c'

    def poll(self, ip_address: str, params: dict) -> PollResult:
        community = params.get('community', 'public')
        oid = params.get('oid', '1.3.6.1.2.1.1.1.0')
        timeout_sec = int(params.get('timeout', 5))
        port = int(params.get('port', 161))

        try:
            from pysnmp.hlapi import (
                getCmd, SnmpEngine, CommunityData, UdpTransportTarget,
                ContextData, ObjectType, ObjectIdentity,
            )
        except ImportError:
            return PollResult(
                success=False,
                details={'error': 'pysnmp не установлен (pip install pysnmp-lextudio)'}
            )

        try:
            iterator = getCmd(
                SnmpEngine(),
                CommunityData(community, mpModel=1),  # mpModel=1 → SNMPv2c
                UdpTransportTarget(
                    (ip_address, port),
                    timeout=timeout_sec,
                    retries=1,
                ),
                ContextData(),
                ObjectType(ObjectIdentity(oid)),
            )

            error_indication, error_status, error_index, var_binds = next(iterator)

            if error_indication:
                return PollResult(
                    success=False,
                    details={'error': str(error_indication)}
                )

            if error_status:
                return PollResult(
                    success=False,
                    details={
                        'error': f'{error_status.prettyPrint()} at {var_binds[int(error_index) - 1][0] if error_index else "?"}',
                    }
                )

            # Успешный ответ
            result_value = ''
            for name, val in var_binds:
                result_value = val.prettyPrint()

            return PollResult(
                success=True,
                details={'oid': oid, 'value': result_value[:200]}
            )

        except Exception as e:
            return PollResult(
                success=False,
                details={'error': str(e)}
            )


registry.register(SNMPPoller)
