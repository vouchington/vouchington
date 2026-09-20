#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_REPO = _HERE.parent


def packaged_allocator_path() -> Path | None:
    try:
        output = subprocess.check_output(
            [
                "node",
                "-e",
                "const {dirname,join}=require('node:path');const {createRequire}=require('node:module');const r=createRequire(process.argv[1]);process.stdout.write(join(dirname(r.resolve('vouchington-tooling/package.json')),'scripts/allocate-browser-safe-ports.py'))",
                str(_REPO / "package.json"),
            ],
            text=True,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    path = Path(output)
    return path if path.is_file() else None


def tooling_spec() -> str:
    output = subprocess.check_output(
        [
            "node",
            "-e",
            "const pkg=require(process.argv[1]); const spec=pkg.dependencies?.['vouchington-tooling'] ?? pkg.devDependencies?.['vouchington-tooling']; if (!spec) throw new Error('vouchington-tooling is not listed in ' + process.argv[1]); process.stdout.write(spec)",
            str(_REPO / "package.json"),
        ],
        text=True,
    ).strip()
    return output[1:] if output.startswith("^") else output


def _load_packaged():
    packaged = packaged_allocator_path()
    if packaged is None:
        return None, None
    spec = importlib.util.spec_from_file_location("_vouchington_allocate", packaged)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load allocator from {packaged}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # Ephemeral (GitHub-hosted) runners never resolve a numeric runner slot, so the
    # packaged allocator's slice-vs-fallback logic always takes the bind(0) fallback
    # path here. That fallback still consults RUNNER_PORT_POLICY for an additional
    # exclusion check, so a policy file must exist — but it need not be repo-owned.
    # Use the policy/forbidden-ports files vouchington-tooling ships next to the
    # packaged script itself instead of a committed ci/runner-port-policy.json.
    module.configure_policy(
        packaged.with_name("runner-port-policy.json"),
        packaged.with_name("fetch-forbidden-ports.json"),
    )
    return module, packaged


_MOD, _PACKAGED = _load_packaged()
if _MOD is not None:
    globals().update({name: getattr(_MOD, name) for name in dir(_MOD) if not name.startswith("_")})


def pid_is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def workspace_from_argv(argv: list[str]) -> str:
    if "--workspace" in argv:
        index = argv.index("--workspace")
        if index + 1 < len(argv):
            return argv[index + 1]
    return (
        os.environ.get("PORT_HOLD_WORKSPACE")
        or os.environ.get("VOUCHA_PORT_HOLD_WORKSPACE")
        or os.environ.get("GITHUB_WORKSPACE")
        or os.getcwd()
    )


def reap_legacy_voucha_identity(workspace: str) -> None:
    digest = hashlib.sha256(str(Path(workspace).resolve()).encode()).hexdigest()
    pid_path = Path(f"/tmp/voucha-port-hold-{digest}") / "pid"
    if not pid_path.is_file():
        return
    try:
        pid = int(pid_path.read_text().strip())
    except (ValueError, OSError):
        pid_path.unlink(missing_ok=True)
        return
    if not pid_is_alive(pid):
        pid_path.unlink(missing_ok=True)
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pid_path.unlink(missing_ok=True)
        return
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline and pid_is_alive(pid):
        time.sleep(0.05)
    if pid_is_alive(pid):
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    pid_path.unlink(missing_ok=True)


if __name__ == "__main__":
    reap_legacy_voucha_identity(workspace_from_argv(sys.argv[1:]))
    # No policy or forbidden-ports override is forwarded here: both the exec'd
    # packaged script and the pnpm-dlx-fetched CLI default those flags to the
    # runner-port-policy.json/fetch-forbidden-ports.json files vouchington-tooling
    # ships next to itself, which is exactly what we want on GitHub-hosted runners.
    forwarded = sys.argv[1:]
    if _PACKAGED is not None:
        os.execv(sys.executable, [sys.executable, str(_PACKAGED), *forwarded])
    spec = tooling_spec()
    if shutil.which("pnpm") is None:
        raise RuntimeError(
            "packaged allocator missing and pnpm is not on PATH; "
            "activate pnpm before allocating ports on a cold or stale tree"
        )
    os.execvp(
        "pnpm",
        [
            "pnpm",
            "dlx",
            "--package",
            f"vouchington-tooling@{spec}",
            "vouchington",
            "allocate-browser-safe-ports",
            *forwarded,
        ],
    )
