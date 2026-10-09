"""Real-process regressions for bounded-command reaping and settlement."""
from __future__ import annotations

import json
import os
from pathlib import Path
import runpy
import selectors
import signal
import subprocess
import sys
import time


def read_event(stream, expected: bytes, seconds: float) -> bytes:
    selector = selectors.DefaultSelector()
    selector.register(stream, selectors.EVENT_READ)
    received = b''
    deadline = time.monotonic() + seconds
    try:
        while expected not in received:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not selector.select(remaining):
                raise AssertionError('Native pipe observation deadline expired')
            chunk = os.read(stream.fileno(), 4096)
            if not chunk:
                raise AssertionError('Pipe closed before required event: ' + repr(received))
            received += chunk
        return received
    finally:
        selector.close()


def cleanup(module, proc, owned):
    module['capture'](owned)
    live_before = module['alive'](owned)
    signal_count = len(live_before)
    if live_before:
        module['send'](owned, signal.SIGKILL)
    statuses = []
    drained, found = module['settle'](proc, owned, signal.SIGKILL, statuses)
    if not drained:
        raise AssertionError('Owned fixture cleanup did not drain')
    proc.wait(timeout=1)
    if module['alive'](owned) or module['children'](os.getpid()):
        raise AssertionError('Owned fixture identities remain')
    return {'cleanupSignalCount': signal_count, 'settlementResidualFound': found,
            'cleanupWaitStatuses': statuses}


def natural(module_path: str, cleanup_module):
    leader = '\n'.join([
        'import os, signal, sys',
        'read_fd, write_fd = os.pipe()',
        'middle = os.fork()',
        'if middle == 0:',
        '    child = os.fork()',
        '    if child == 0:',
        '        os.setsid()',
        '        os.close(read_fd)',
        '        os.write(write_fd, str(os.getpid()).encode())',
        '        os.close(write_fd)',
        '        os._exit(7)',
        '    os._exit(0)',
        'os.close(write_fd)',
        'child = os.read(read_fd, 64).decode()',
        'os.close(read_fd)',
        'os.waitpid(middle, 0)',
        'print("OWNED_CHILD=" + child, flush=True)',
        'if sys.stdin.buffer.read(1) != b"x": raise RuntimeError("leader release missing")',
    ])
    proc = subprocess.Popen(
        [sys.executable, module_path, '6', sys.executable, '-c', leader],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    owned = {}
    primary = None
    report = {}
    cleanup_report = {}
    try:
        ready = read_event(proc.stdout, b'\n', 2).decode().strip()
        child = int(ready.removeprefix('OWNED_CHILD='))
        event = read_event(proc.stderr, f'Reaped owned PID {child}: exit 7'.encode(), 2)
        if proc.poll() is not None:
            raise AssertionError('Leader terminated before its release')
        if Path(f'/proc/{child}/stat').exists():
            raise AssertionError('Adopted child still exists after reaping event')
        proc.stdin.write(b'x')
        proc.stdin.flush()
        proc.stdin.close()
        code = proc.wait(timeout=2)
        if code != 0:
            raise AssertionError(f'Successful leader was overridden: {code}')
        report = {'case': 'natural-reap', 'code': code, 'reapedBeforeRelease': True,
                  'event': event.decode(), 'childAbsent': True}
    except BaseException as error:
        primary = error
    finally:
        try:
            cleanup_report = cleanup(cleanup_module, proc, owned)
        except BaseException as error:
            if primary is not None:
                raise BaseExceptionGroup('Regression and cleanup failed', [primary, error])
            raise
        for stream in [proc.stdin, proc.stdout, proc.stderr]:
            if stream is not None:
                stream.close()
    print(json.dumps({**report, **cleanup_report, 'primaryFailed': primary is not None}), flush=True)
    if primary is not None:
        raise primary
    if cleanup_report.get('cleanupSignalCount') or cleanup_report.get('settlementResidualFound'):
        raise AssertionError('Passing regression required live-identity failure cleanup')


def settlement(module_path: str, cleanup_module):
    module = runpy.run_path(module_path)
    proc = subprocess.Popen([sys.executable, '-c', 'raise SystemExit(0)'])
    proc.wait(timeout=2)
    owned = {}
    if module['alive'](owned):
        raise AssertionError('Pre-settlement ownership snapshot was not empty')
    child_code = '\n'.join([
        'import os, signal',
        'if os.fork() != 0: os._exit(0)',
        'os.setsid()',
        'signal.signal(signal.SIGTERM, lambda _sig, _frame: os._exit(0))',
        'print("TERM_READY=" + str(os.getpid()), flush=True)',
        'signal.pause()',
    ])
    child = subprocess.Popen([sys.executable, '-c', child_code], stdout=subprocess.PIPE)
    primary = None
    report = {}
    cleanup_report = {}
    try:
        ready = read_event(child.stdout, b'\n', 2).decode().strip()
        orphan = int(ready.removeprefix('TERM_READY='))
        child.wait(timeout=2)
        child_identity = cleanup_module['identity'](orphan)
        if child_identity is None or cleanup_module['state'](orphan)[2] != os.getpid():
            raise AssertionError('TERM-ready child was not actually adopted')
        statuses = []
        result = module['settle'](proc, owned, signal.SIGTERM, statuses)
        if result != (True, True):
            raise AssertionError(f'Late residual discovery was not propagated: {result!r}')
        if statuses != [0]:
            raise AssertionError(f'Expected actual TERM0 wait status: {statuses!r}')
        if cleanup_module['identity'](orphan) == child_identity:
            raise AssertionError('TERM0 fixture identity remains')
        report = {'case': 'late-settlement', 'drained': True,
                  'foundResidual': True, 'childAbsent': True}
    except BaseException as error:
        primary = error
    finally:
        try:
            cleanup_report = cleanup(cleanup_module, proc, owned)
        except BaseException as error:
            if primary is not None:
                raise BaseExceptionGroup('Regression and cleanup failed', [primary, error])
            raise
        child.wait(timeout=1)
        child.stdout.close()
    print(json.dumps({**report, **cleanup_report, 'primaryFailed': primary is not None}), flush=True)
    if primary is not None:
        raise primary
    if cleanup_report.get('cleanupSignalCount') or cleanup_report.get('settlementResidualFound'):
        raise AssertionError('Passing regression required live-identity failure cleanup')


def main():
    case, module_path, cleanup_path = sys.argv[1:]
    cleanup_module = runpy.run_path(cleanup_path)
    cleanup_module['enable_subreaper']()
    if case == 'natural':
        natural(module_path, cleanup_module)
    elif case == 'settlement':
        settlement(module_path, cleanup_module)
    else:
        raise ValueError('Unknown regression case')
    if cleanup_module['children'](os.getpid()):
        raise AssertionError('Regression children remain')


if __name__ == '__main__':
    main()
