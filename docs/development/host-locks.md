# Per-User Host Locks

Repository entry points coordinate expensive host work and host package-manager mutations through
[`ci/with-host-lock.sh`](../../ci/with-host-lock.sh), a bootstrap shim over the published
`vouchington with-host-lock` CLI. It must run before `node_modules` and before Node exist, so it maps
`VOUCHA_HOST_LOCK_*` onto `HOST_LOCK_*` and execs the packaged shell script, `pnpm dlx`, or a
curl+tar fetch of the published tarball.
The lock scope is one OS user: the helper creates `/tmp/voucha-host-lock-<uid>/<family>.lock.d`.
The stable `/tmp` base coordinates runner registrations even when they use different `TMPDIR` or
`HOME` values; the UID suffix keeps the namespace private to that user. A different OS user or a
container has a different namespace and does not coordinate.

The shim reads `VOUCHA_HOST_LOCK_*` and, when no root is set, defaults `HOST_LOCK_ROOT` to
`/tmp/voucha-host-lock-<uid>` so existing callers do not move. Set the absolute
`VOUCHA_HOST_LOCK_ROOT` only when every participating process uses the same alternate root. The
published CLI uses `HOST_LOCK_*` instead. The helper rejects symlinked roots and roots not owned
by the current UID.

You can also run the published CLI: `vouchington with-host-lock --name expensive-build --timeout-seconds 60 -- command`.

## Contract

Call the generic helper with one named family, a positive acquisition timeout, and a command:

```sh
bash ci/with-host-lock.sh --name expensive-build --timeout-seconds 60 -- command arg
```

One logical command path may own at most one host lock. The shim rejects nested invocation when
either `VOUCHA_HOST_LOCK_ACTIVE` or `HOST_LOCK_ACTIVE` is set; the published helper then exports
`HOST_LOCK_ACTIVE=1` to every child, including commands started by a CI fail-open path.
Canonical wrappers, package scripts, workflow actions, and container commands must therefore
identify one lock owner instead of composing wrappers.

[`ci/with-build-lock.sh`](../../ci/with-build-lock.sh) is the canonical `expensive-build` wrapper:

- It waits 60 seconds by default. `VOUCHA_BUILD_LOCK_WAIT_SECONDS` accepts only positive integers up
  to 300.
- Locally, acquisition failure is fail-closed and commands have no timeout by default.
- In GitHub Actions, acquisition failure runs the command unlocked instead of failing from
  contention. The generic command has a 300-second default cap and normally returns 124 if that cap
  expires. The shared `build-web-targets` action gives host-side Next builds an explicit 360-second
  cap; local builds remain uncapped. If the timed-out process group survives the wrapper's `TERM`
  and `SIGKILL` drain, the wrapper retains lock ownership and exits 1 instead, so a new compiler
  cannot overlap the live process group.
- `VOUCHA_BUILD_LOCK_ON_ACQUIRE_TIMEOUT=fail` opts a CI caller into fail-closed admission. Host-side
  Next builds use that mode with a 300-second wait so normal physical-host queue depth does not
  cause overlapping compilers or premature admission failures.
- `VOUCHA_BUILD_LOCK_COMMAND_TIMEOUT_SECONDS` overrides the command cap. Build failures and command
  timeouts run [`ci/host-pressure-diagnostics.sh`](../../ci/host-pressure-diagnostics.sh) without
  changing the command status.

Size any per-step override of `VOUCHA_BUILD_LOCK_COMMAND_TIMEOUT_SECONDS` against the worst _healthy_
wall time for whatever work actually runs inside that locked window — not the median, and not by
copying an existing number forward when the window's scope changes (an unlocked prefetch step moving
work out of the locked command shrinks the window and invalidates any cap sized against the old one).
A self-hosted macOS runner's healthy-vs-saturated spread is wide — the Android build step's healthy
step times have ranged 404–575s across observed runs (404s on a quiet host), while a separate incident
recorded 787–828s timeout failures during a ~1-hour window of host CPU oversubscription from another
process on the same physical host (the interactive desktop session sharing a runner machine, not a
second `expensive-build` consumer; a same-day sweep found no other CI job on that host, and the
desktop session runs no lock consumer) — failures that were still making healthy progress when killed.
[`ci/host-pressure-diagnostics.sh`](../../ci/host-pressure-diagnostics.sh)'s Darwin branch now reports
a `load1 per cpu` ratio plus decoded `vm_pressure_level`/`memory_pressure -Q` output, so a future
incident on this host does not need the hand cross-referencing above — read that ratio directly to
confirm oversubscription instead of inferring it from step-time spread.
Lowering the cap to sit inside the healthy band would not have prevented either failure — they each
needed _more_ budget, not less — while it would turn slow-but-healthy runs red. Re-derive the cap from
fresh step-time data after any change to what runs inside the locked window; don't lower it
preemptively.

[`ci/with-heavy-slot.sh`](../../ci/with-heavy-slot.sh) is reserved for type-aware oxlint. It uses
the single numbered member `memory-heavy-slot-1`, waits 60 seconds by default, and accepts only
positive `VOUCHA_HEAVY_SLOT_WAIT_SECONDS` values up to 60. Local acquisition remains fail-closed;
GitHub Actions runs oxlint unlocked after the wait. `VOUCHA_HEAVY_SLOT_COMMAND_TIMEOUT_SECONDS`
optionally caps the command, and failures retain host-pressure diagnostics.

The generic helper keeps acquisition timeouts configurable because the separate package-manager
correctness lock uses a 300-second fail-closed wait. Its polling is deadline-bounded, so it does not
sleep for a complete poll interval after the configured deadline.

| Family                   | Capacity | Default wait | CI acquisition timeout | Purpose                                      |
| ------------------------ | -------- | ------------ | ---------------------- | -------------------------------------------- |
| `memory-heavy`           | 1        | 60 seconds   | Run unlocked           | Type-aware oxlint only                       |
| `expensive-build`        | 1        | 60 seconds   | Run unlocked           | Compiler-heavy repository build entry points |
| `expensive-build` (Next) | 1        | 300 seconds  | Fail closed            | Host-side Next.js builds                     |
| `host-package-manager`   | 1        | 300 seconds  | Fail closed            | Host package-manager mutations               |

The helper writes the live command PID, process-group ID, and a random ownership token before
releasing the command's start barrier. Signals are forwarded to the command process group, and
ownership remains until the full group exits. After the main command returns, descendants receive a
30-second drain period before the wrapper sends `TERM`, then `KILL`. An unkillable process group
keeps the lock metadata instead of releasing ownership. The command metadata replaces the wrapper
PID, so a command surviving wrapper `SIGKILL` continues to protect its work.

Dead owner PIDs and process groups are reclaimed immediately. Every held lock is also bound to a
60-second lease (`VOUCHA_HOST_LOCK_LEASE_SECONDS`, minimum 4): a background heartbeat touches the
lock directory every quarter-lease while a live owner holds it, and a competing waiter reclaims the
directory once its mtime is older than the lease. The short-lived reclamation mutex uses the same
PID/token ownership model and a 10-second ownerless initialization grace. Cleanup verifies ownership
metadata before removing either directory.

## Coverage

Use canonical repository entry points so each expensive command has exactly one owner:

| Surface         | `memory-heavy`    | `expensive-build`            | Unlocked work                                         |
| --------------- | ----------------- | ---------------------------- | ----------------------------------------------------- |
| Static analysis | Type-aware oxlint | None                         | no-mistakes and all other analyzers                   |
| Web             | None              | Next.js and Storybook builds | Vitest, Playwright, Storybook snapshot/browser tests  |
| Backend/tooling | None              | None                         | Backend, web, credentialed, and tooling Vitest suites |
| Host setup      | None              | None                         | Package mutations use the separate correctness lock   |

The web package scripts own the Next and Storybook locks; callers of
`ci/setup-web-integration.mts` must not add an outer lock.

Measured on the Z890 host, `oxlint --type-aware` peaked at 4.0–4.3 GiB. It is the only retained
heavy-slot consumer because it uses all available cores. Vitest, Playwright, and Storybook browser
tests deliberately run without admission locking; workflow sharding and runner capacity own their
concurrency.

`next build` still serializes compilers with `expensive-build`, but Next's page-data pool defaults
to `os.cpus().length - 1`. On the 12 GiB NucBox that is 11 workers after a ~6.5 GiB compile, which
OOM-killed `next-build` (Main CI web runs 33588522838 with 11 workers and 33774935536 with the
previous 2-worker cap). Next's `memoryBasedWorkersCount` still enforces a 4-worker minimum, so
[`web/next.config.ts`](../../web/next.config.ts) sets `experimental.cpus` from
[`web/next-build-page-data-worker-count.ts`](../../web/next-build-page-data-worker-count.ts)
instead. The helper sizes from the smaller of physical RAM and `process.constrainedMemory()`, which
matters on Linux runners whose service cgroup is stricter than the machine.

The helper reserves 10 GiB before allocating remaining workers — mostly this build's own compile
footprint plus the measured OS/runner-agent baseline, not fleet over-commitment. Re-measure before
lowering it: see [fleet measurements](reference-host-locks-nextjs-build-worker-reserve.md).

Build duration doesn't motivate lowering it either: sampled `build-web-targets` step durations show
timeout headroom, not worker-count neutrality — see the fleet-measurements doc's build-duration
table, which also documents that `experimental.cpus` sizes the worker pool for both the
"Collecting page data" and "Generating static pages" build phases. Do not lower the reserve
without first re-measuring both tables there.

The web image build invokes Next directly inside [`web/Dockerfile`](../../web/Dockerfile). The build
container does not include `ci/`, and a lock inside its separate user namespace would not coordinate
with the host.

Coordination does not reduce GitHub Actions runner demand. Most retained scheduling locks are
best-effort in CI: after 60 seconds the command starts unlocked. Host-side Next builds are the
strict exception: they wait up to 300 seconds and fail closed rather than overlap. Command failures
and command timeouts still propagate normally. Direct generic `with-build-lock.sh` steps use an
eight-to-twelve-minute backstop; strict Next steps use thirteen minutes for the five-minute
acquisition wait, six-minute command circuit breaker, 30-second process drain, and one-minute
composite summary/upload margin. Job-level timeouts still cover the complete healthy workflow.

## Related Entry Points

- CI scripts and local wrappers: [`ci/README.md`](../../ci/README.md)
- Workflow runner rules: [`.github/workflows/RUNNERS.md`](../../.github/workflows/RUNNERS.md)
- Web workspace rules: [`web/CLAUDE.md`](../../web/CLAUDE.md)
- Native workspace rules: [vouchington/vouchington-clients](https://github.com/vouchington/vouchington-clients)
