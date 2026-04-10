"""
ICMP Poller — ping устройства.
Метаданные (название, параметры) хранятся в БД (MonitorProtocol с poller_id='icmp').
"""

import subprocess
import platform
import re
from .base import BasePoller, PollResult, registry


class ICMPPoller(BasePoller):
    protocol = 'icmp'

    def poll(self, ip_address: str, params: dict) -> PollResult:
        timeout = int(params.get('timeout', 2))
        count = int(params.get('count', 3))

        try:
            is_win = platform.system().lower() == 'windows'
            cmd = ['ping']
            if is_win:
                cmd += ['-n', str(count), '-w', str(timeout * 1000), ip_address]
            else:
                cmd += ['-c', str(count), '-W', str(timeout), ip_address]

            result = subprocess.run(
                cmd, capture_output=True, text=True,
                timeout=timeout * count + 5
            )

            success = result.returncode == 0
            rtt_avg = None
            if success:
                match = re.search(r'(?:avg|Average)[/ =]+(\d+\.?\d*)', result.stdout)
                if match:
                    rtt_avg = float(match.group(1))

            details = {'rtt_avg_ms': rtt_avg}
            if not success:
                details['error'] = result.stderr.strip() or 'Узел недоступен'

            return PollResult(success=success, details=details)

        except subprocess.TimeoutExpired:
            return PollResult(success=False, details={'error': 'Таймаут ping'})
        except Exception as e:
            return PollResult(success=False, details={'error': str(e)})


registry.register(ICMPPoller)
