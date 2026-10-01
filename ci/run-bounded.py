#!/usr/bin/env python3
"""Run a command until it exits or the deadline elapses, then kill its process group.

The signals come from the calling user, so a root-owned descendant (anything run through
`sudo`, such as Playwright's apt-get) survives the deadline, keeps its locks, and outlives
the exit status 124 reported here. Bound only commands that run entirely as the caller.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys


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

    proc = subprocess.Popen(sys.argv[2:], start_new_session=True)
    try:
        raise SystemExit(proc.wait(timeout=seconds))
    except subprocess.TimeoutExpired:
        signal_group(proc.pid, signal.SIGTERM)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            signal_group(proc.pid, signal.SIGKILL)
            proc.wait()
        raise SystemExit(124) from None


if __name__ == '__main__':
    main()
