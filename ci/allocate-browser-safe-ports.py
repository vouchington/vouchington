#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import sys
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


if __name__ == "__main__":
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
