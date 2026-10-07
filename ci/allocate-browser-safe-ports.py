#!/usr/bin/env python3
"""Run vouchington-tooling's browser-safe port allocator.

The allocator is a stdlib-only script that vouchington-tooling ships in
scripts/, next to the runner port policy and Fetch-forbidden port catalog it
reads. An installed workspace runs that copy. A job without an install (the
image builds) fetches the tarball pinned in pnpm-lock.yaml, checks it against
the lockfile integrity, and runs the script from it. This never resolves the
package's dependency tree: `pnpm dlx` did, and failed whenever a dependency
release straddled the minimumReleaseAge cutoff.
"""
from __future__ import annotations

import base64
import hashlib
import io
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

PACKAGE = "vouchington-tooling"
SCRIPT = "allocate-browser-safe-ports.py"
# The allocator reads these siblings of its script at runtime.
PACKAGED_FILES = (SCRIPT, "fetch-forbidden-ports.json", "runner-port-policy.json")
DEFAULT_REGISTRY = "https://registry.npmjs.org/"
REPO = Path(__file__).resolve().parent.parent


def installed_allocator() -> Path | None:
    path = REPO / "node_modules" / PACKAGE / "scripts" / SCRIPT
    return path if path.is_file() else None


def locked_package() -> tuple[str, str]:
    """Return the root importer's locked version and its tarball integrity."""
    lockfile = (REPO / "pnpm-lock.yaml").read_text()
    root = re.search(r"^  \.:\n((?: {4,}.*\n)+)", lockfile, re.MULTILINE)
    version = root and re.search(
        rf"^      {re.escape(PACKAGE)}:\n        specifier: .*\n        version: ([^\s(]+)",
        root.group(1),
        re.MULTILINE,
    )
    if not version:
        raise SystemExit(f"pnpm-lock.yaml does not lock {PACKAGE} for the workspace root")
    integrity = re.search(
        rf"^  {re.escape(PACKAGE)}@{re.escape(version.group(1))}:\n"
        r"    resolution: \{integrity: (sha512-[A-Za-z0-9+/]+=*)\}",
        lockfile,
        re.MULTILINE,
    )
    if not integrity:
        raise SystemExit(f"pnpm-lock.yaml has no sha512 integrity for {PACKAGE}@{version.group(1)}")
    return version.group(1), integrity.group(1)


def fetch_verified_tarball(version: str, integrity: str) -> bytes:
    registry = os.environ.get("npm_config_registry") or DEFAULT_REGISTRY
    url = f"{registry.rstrip('/')}/{PACKAGE}/-/{PACKAGE}-{version}.tgz"
    with urllib.request.urlopen(url, timeout=60) as response:
        tarball = response.read()
    actual = "sha512-" + base64.b64encode(hashlib.sha512(tarball).digest()).decode()
    if actual != integrity:
        raise SystemExit(f"{url} does not match the pnpm-lock.yaml integrity for {PACKAGE}@{version}")
    return tarball


def extract_allocator(tarball: bytes, destination: Path) -> Path:
    """Write only the allocator's own files; never extract arbitrary members."""
    with tarfile.open(fileobj=io.BytesIO(tarball), mode="r:gz") as archive:
        for name in PACKAGED_FILES:
            member = archive.getmember(f"package/scripts/{name}")
            source = archive.extractfile(member) if member.isfile() else None
            if source is None:
                raise SystemExit(f"{PACKAGE} tarball has no regular file scripts/{name}")
            (destination / name).write_bytes(source.read())
    return destination / SCRIPT


def main(arguments: list[str]) -> int:
    installed = installed_allocator()
    if installed is not None:
        os.execv(sys.executable, [sys.executable, str(installed), *arguments])
    tarball = fetch_verified_tarball(*locked_package())
    with tempfile.TemporaryDirectory(prefix=f"{PACKAGE}-allocator-") as directory:
        allocator = extract_allocator(tarball, Path(directory))
        return subprocess.run([sys.executable, str(allocator), *arguments], check=False).returncode


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
