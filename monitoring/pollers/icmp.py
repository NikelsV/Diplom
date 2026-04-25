"""
ICMP Poller — проверка доступности устройства.

Стратегия (от самого надёжного к фолбэку):
  1. Unprivileged ICMP datagram-сокет (SOCK_DGRAM, IPPROTO_ICMP).
     Работает на Linux без root, если UID попадает в net.ipv4.ping_group_range.
     Внутри нашего контейнера это настроено в Containerfile через sysctl-конфиг.

  2. Системная команда `ping` через subprocess. Сработает, если у бинарника
     стоит CAP_NET_RAW (на хосте обычно так и есть).

  3. TCP-фолбэк — пробуем установить TCP-соединение на популярные порты
     (params['tcp_fallback_ports'], по умолчанию [80, 443, 22]).
     Нужен, когда ICMP заблокирован файрволом или окружением (rootless без настроек).
     Параметр позволяет отключить (tcp_fallback=False).

Параметры:
  timeout — таймаут одной попытки (сек), default 2.
  count   — кол-во ICMP-пакетов, default 3.
  tcp_fallback        — включить TCP-фолбэк, default True.
  tcp_fallback_ports  — список TCP-портов для фолбэка, default [80, 443, 22].
"""

import os
import socket
import struct
import subprocess
import platform
import re
import time
from .base import BasePoller, PollResult, registry


def _icmp_checksum(data: bytes) -> int:
    """Стандартная контрольная сумма ICMP (RFC 1071)."""
    s = 0
    for i in range(0, len(data) - 1, 2):
        s += (data[i] << 8) + data[i + 1]
    if len(data) % 2:
        s += data[-1] << 8
    s = (s >> 16) + (s & 0xFFFF)
    s += s >> 16
    return ~s & 0xFFFF


def _ping_unprivileged(ip: str, timeout: float, count: int):
    """
    Ping через unprivileged ICMP datagram-сокет.
    Возвращает (success: bool, rtt_avg_ms: float|None, error: str|None).
    Может бросить PermissionError, если UID не в ping_group_range.
    """
    rtts = []
    last_error = None
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_ICMP)
        sock.settimeout(timeout)
        ident = os.getpid() & 0xFFFF

        for seq in range(count):
            # ICMP Echo Request: type=8, code=0
            header = struct.pack('!BBHHH', 8, 0, 0, ident, seq)
            payload = b'webmap-monitor-' + str(seq).encode()
            checksum = _icmp_checksum(header + payload)
            packet = struct.pack('!BBHHH', 8, 0, checksum, ident, seq) + payload

            try:
                start = time.time()
                sock.sendto(packet, (ip, 0))
                # Цикл приёма: ядро может отдать чужой ответ — ждём свой.
                deadline = start + timeout
                while True:
                    remaining = deadline - time.time()
                    if remaining <= 0:
                        last_error = 'timeout'
                        break
                    sock.settimeout(remaining)
                    data, _ = sock.recvfrom(1024)
                    # На AF_INET+SOCK_DGRAM ядро отдаёт уже без IP-заголовка.
                    if len(data) < 8:
                        continue
                    r_type, r_code, _, r_id, r_seq = struct.unpack('!BBHHH', data[:8])
                    if r_type == 0 and r_id == ident and r_seq == seq:
                        rtts.append((time.time() - start) * 1000)
                        break
            except socket.timeout:
                last_error = 'timeout'
            except OSError as e:
                last_error = str(e)
                break

        if rtts:
            return True, sum(rtts) / len(rtts), None
        return False, None, last_error or 'no reply'
    finally:
        if sock is not None:
            try:
                sock.close()
            except Exception:
                pass


def _ping_subprocess(ip: str, timeout: int, count: int):
    """Системный `ping`. Возвращает (success, rtt_avg_ms, error)."""
    is_win = platform.system().lower() == 'windows'
    cmd = ['ping']
    if is_win:
        cmd += ['-n', str(count), '-w', str(timeout * 1000), ip]
    else:
        cmd += ['-c', str(count), '-W', str(timeout), ip]
    try:
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
        if not success:
            err = result.stderr.strip() or result.stdout.strip() or 'unreachable'
            return False, None, err
        return True, rtt_avg, None
    except subprocess.TimeoutExpired:
        return False, None, 'timeout'
    except FileNotFoundError:
        return False, None, 'ping binary not found'
    except Exception as e:
        return False, None, str(e)


def _tcp_check(ip: str, ports, timeout: float):
    """
    TCP-фолбэк: пробуем connect на каждый порт по очереди.
    Возвращает (success, rtt_avg_ms, port_used, error).

    Хитрость: TCP-connect к закрытому порту, на который сервер активно отвечает
    RST — это тоже доказательство, что хост ЖИВ (просто на этом порту нет сервиса).
    Поэтому мы различаем "ConnectionRefused" (хост жив!) и "TimedOut" (хост мёртв).
    """
    last_error = None
    for port in ports:
        try:
            start = time.time()
            with socket.create_connection((ip, port), timeout=timeout):
                return True, (time.time() - start) * 1000, port, None
        except ConnectionRefusedError:
            # Хост ответил RST — значит он живой.
            return True, (time.time() - start) * 1000, port, 'tcp-refused (host alive)'
        except (socket.timeout, TimeoutError):
            last_error = f'tcp:{port} timeout'
        except OSError as e:
            last_error = f'tcp:{port} {e}'
    return False, None, None, last_error or 'no tcp ports answered'


class ICMPPoller(BasePoller):
    protocol = 'icmp'

    def poll(self, ip_address: str, params: dict) -> PollResult:
        timeout = int(params.get('timeout', 2))
        count = int(params.get('count', 3))
        tcp_fallback = bool(params.get('tcp_fallback', True))
        tcp_ports = params.get('tcp_fallback_ports') or [80, 443, 22]
        if isinstance(tcp_ports, str):
            # Если в админке/UI ввели строку "80,443,22"
            tcp_ports = [int(p.strip()) for p in tcp_ports.split(',') if p.strip()]

        attempts = []  # сюда складываем, что пробовали — пригодится для деталей ошибки

        # 1. Unprivileged ICMP datagram-сокет.
        try:
            ok, rtt, err = _ping_unprivileged(ip_address, float(timeout), count)
            if ok:
                return PollResult(success=True,
                                  details={'method': 'icmp_unpriv', 'rtt_avg_ms': rtt})
            attempts.append(f'icmp_unpriv: {err}')
        except PermissionError as e:
            attempts.append(f'icmp_unpriv: {e}')
        except OSError as e:
            attempts.append(f'icmp_unpriv: {e}')

        # 2. Системная команда ping.
        ok, rtt, err = _ping_subprocess(ip_address, timeout, count)
        if ok:
            return PollResult(success=True,
                              details={'method': 'icmp_subproc', 'rtt_avg_ms': rtt})
        attempts.append(f'icmp_subproc: {err}')

        # 3. TCP-фолбэк.
        if tcp_fallback:
            ok, rtt, port, err = _tcp_check(ip_address, tcp_ports, float(timeout))
            if ok:
                return PollResult(success=True,
                                  details={'method': 'tcp_check',
                                           'tcp_port': port,
                                           'rtt_avg_ms': rtt,
                                           'note': err or 'tcp connect ok'})
            attempts.append(f'tcp_check: {err}')

        return PollResult(success=False,
                          details={'error': 'host unreachable',
                                   'attempts': attempts})


registry.register(ICMPPoller)
