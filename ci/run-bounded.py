#!/usr/bin/env python3
"""Run a command until it exits or the deadline elapses, then kill its process group."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
import time

RELAY_JOIN_SECONDS = 3


def relay(source: int, target: int) -> None:
    while True:
        try:
            data = os.read(source, 65536)
        except OSError:
            return
        if not data:
            return
        try:
            while data:
                data = data[os.write(target, data) :]
        except OSError:
            target = os.open(os.devnull, os.O_WRONLY)  # keep draining so the command never blocks


def signal_group(pid: int, sig: int) -> None:
    try:
        os.killpg(pid, sig)
    except ProcessLookupError:
        return


def main() -> None:
    if len(sys.argv) < 3:
        print('usage: run-bounded.py <seconds> <command> [args...]', file=sys.stderr)
        raise SystemExit(2)
    try:
        seconds = int(sys.argv[1])
    except ValueError:
        print('timeout seconds must be an integer', file=sys.stderr)
        raise SystemExit(2) from None
    if seconds < 1:
        print('timeout seconds must be positive', file=sys.stderr)
        raise SystemExit(2)

    proc = subprocess.Popen(
        sys.argv[2:], stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True
    )
    assert proc.stdout is not None and proc.stderr is not None
    relays = [
        threading.Thread(target=relay, args=(stream.fileno(), fd), daemon=True)
        for stream, fd in ((proc.stdout, 1), (proc.stderr, 2))
    ]
    for thread in relays:
        thread.start()
    status = run(proc, seconds)
    # A descendant that left the process group can keep the pipes open; do not wait for it.
    deadline = time.monotonic() + RELAY_JOIN_SECONDS
    for thread in relays:
        thread.join(max(0.0, deadline - time.monotonic()))
    raise SystemExit(status)


def run(proc: subprocess.Popen[bytes], seconds: int) -> int:
    try:
        return proc.wait(timeout=seconds)
    except subprocess.TimeoutExpired:
        signal_group(proc.pid, signal.SIGTERM)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
        # The parent can exit on SIGTERM while a descendant keeps running.
        # Finish cleaning the group even when waiting for the parent succeeded.
        signal_group(proc.pid, signal.SIGKILL)
        proc.wait()
        return 124


if __name__ == '__main__':
    main()
