#!/usr/bin/env python3
"""Bound a CI command and reap its owned descendants, including detached sessions."""

from __future__ import annotations

import ctypes
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def state(pid: int) -> tuple[int, str, int] | None:
    try:
        fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
        return pid, fields[19], int(fields[1])
    except FileNotFoundError:
        return None


def identity(pid: int) -> tuple[int, str] | None:
    current = state(pid)
    return current[:2] if current is not None else None


def children(pid: int) -> set[int]:
    result: set[int] = set()
    try:
        tasks = list(Path(f'/proc/{pid}/task').iterdir())
    except FileNotFoundError:
        return result
    for task in tasks:
        try:
            result.update(map(int, (task / 'children').read_text().split()))
        except FileNotFoundError:
            pass
    return result


def capture(owned: dict[int, str]) -> bool:
    wrapper = identity(os.getpid())
    pending = [(pid, wrapper) for pid in children(os.getpid())]
    visited: set[tuple[int, str]] = set()
    scan_until = time.monotonic() + 0.05
    while pending and len(visited) < 4096 and time.monotonic() < scan_until:
        pid, expected_parent = pending.pop()
        before = state(pid)
        if before is None:
            continue
        try:
            descriptor = os.pidfd_open(pid)
        except ProcessLookupError:
            continue
        try:
            info = Path(f'/proc/self/fdinfo/{descriptor}').read_text().splitlines()
            fd_pid = next(line.split(':', 1)[1].strip() for line in info if line.startswith('Pid:'))
            after = state(pid)
            if fd_pid != str(pid) or after is None or after[:2] != before[:2]:
                continue
            adopted = after[2] == wrapper[0] and identity(wrapper[0]) == wrapper
            parent_valid = after[2] == expected_parent[0] and identity(expected_parent[0]) == expected_parent
            if not adopted and not parent_valid:
                continue
            current = after[:2]
            if current in visited:
                continue
            visited.add(current)
            owned[pid] = current[1]
            descendants = children(pid)
            if identity(pid) == current:
                pending.extend((child, current) for child in descendants)
        finally:
            os.close(descriptor)
    return not pending


def alive(owned: dict[int, str]) -> list[int]:
    return [pid for pid, start in owned.items() if identity(pid) == (pid, start)]


def reap(proc: subprocess.Popen, owned: dict[int, str], statuses: list[int]) -> None:
    proc.poll()
    for pid in children(os.getpid()) - {proc.pid}:
        if identity(pid) != (pid, owned.get(pid)):
            continue
        try:
            waited, status = os.waitpid(pid, os.WNOHANG)
            if waited:
                code = os.waitstatus_to_exitcode(status)
                statuses.append(code)
                print(f'Reaped owned PID {pid}: exit {code}', file=sys.stderr)
        except ChildProcessError:
            pass


def send(owned: dict[int, str], sig: int) -> None:
    for pid in alive(owned):
        try:
            descriptor = os.pidfd_open(pid)
        except ProcessLookupError:
            continue
        try:
            if identity(pid) == (pid, owned[pid]):
                signal.pidfd_send_signal(descriptor, sig)
        except ProcessLookupError:
            pass
        finally:
            os.close(descriptor)


def settle(proc: subprocess.Popen, owned: dict[int, str], sig: int, statuses: list[int]) -> tuple[bool, bool]:
    deadline = time.monotonic() + 1
    signaled: dict[int, str] = {}
    found_residual = False
    while True:
        scan_complete = capture(owned)
        reap(proc, owned, statuses)
        live = alive(owned)
        found_residual = found_residual or any(pid != proc.pid for pid in live)
        fresh = {pid: owned[pid] for pid in live if signaled.get(pid) != owned[pid]}
        send(fresh, sig)
        signaled.update(fresh)
        reap(proc, owned, statuses)
        if scan_complete and not alive(owned) and not children(os.getpid()):
            return True, found_residual
        if time.monotonic() >= deadline:
            return False, found_residual
        time.sleep(0.01)


def enable_subreaper() -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    value = ctypes.c_int()
    if libc.prctl(36, 1, 0, 0, 0) or libc.prctl(37, ctypes.byref(value), 0, 0, 0):
        raise OSError(ctypes.get_errno(), 'Cannot establish CI child subreaper')
    if value.value != 1:
        raise RuntimeError('CI child subreaper not enabled')


def group_only(seconds: int) -> int:
    # Preserve the existing non-Linux group contract; full descendant ownership is Linux-only.
    proc = subprocess.Popen(sys.argv[2:], start_new_session=True)
    try:
        return proc.wait(timeout=seconds)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait()
        return 124


def main() -> int:
    if len(sys.argv) < 3:
        print('usage: run-bounded.py <seconds> <command> [args...]', file=sys.stderr)
        return 2
    try:
        seconds = int(sys.argv[1])
    except ValueError:
        print('timeout seconds must be an integer', file=sys.stderr)
        return 2
    if seconds < 1:
        print('timeout seconds must be positive', file=sys.stderr)
        return 2
    if sys.platform != 'linux':
        return group_only(seconds)
    if not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        raise RuntimeError('Linux CI requires identity-safe pidfd signaling')
    enable_subreaper()
    interrupted: list[int] = []
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda number, _frame: interrupted.append(number))
    proc = subprocess.Popen(sys.argv[2:], start_new_session=True)
    owned: dict[int, str] = {}
    adopted_statuses: list[int] = []
    deadline = time.monotonic() + seconds
    timed_out = False
    code: int | None = None
    try:
        while code is None and not interrupted:
            capture(owned)
            reap(proc, owned, adopted_statuses)
            code = proc.poll()
            timed_out = code is None and time.monotonic() >= deadline
            if code is not None or timed_out:
                break
            time.sleep(min(0.1, max(0, deadline - time.monotonic())))
    finally:
        capture(owned)
        reap(proc, owned, adopted_statuses)
        residual = bool(alive(owned))
        drained, discovered = settle(proc, owned, signal.SIGTERM, adopted_statuses)
        residual = residual or discovered
        if not drained:
            drained, discovered = settle(proc, owned, signal.SIGKILL, adopted_statuses)
            residual = residual or discovered
        if not drained:
            print('Owned descendants remain after bounded cleanup', file=sys.stderr)
        elif residual:
            print('Reaped owned descendants after command termination', file=sys.stderr)
    if interrupted:
        return 128 + interrupted[0]
    if timed_out:
        return 124
    if code is None:
        return 1
    if code != 0:
        return code
    return 1 if residual or not drained else 0


if __name__ == '__main__':
    raise SystemExit(main())
