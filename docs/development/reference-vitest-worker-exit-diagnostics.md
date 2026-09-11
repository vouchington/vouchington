# Vitest Worker-Exit Diagnostics

[Back to Vitest Projects](reference-tests-vitest-projects.md#vitest-worker-exit-diagnostics)

Backend unit shards occasionally fail after a fully passing summary with
`Error: [vitest-pool]: Worker forks emitted error.` / `Caused by: Error: Worker exited unexpectedly`
(the `backend-unit-vitest-worker-exit-after-pass` signature). Vitest 4's forks-pool rewrite
(`ForksPoolWorker`, replacing tinypool — upstream
[#8649](https://github.com/vitest-dev/vitest/issues/8649)) discards the dying fork's exit code and
signal before the error ever reaches a reporter, so the failure carried no cause on its own. The
instrumentation below (issue
[#8940](https://github.com/jonathanong/filaments/issues/8940)) exists to make that cause observable
without another round of add-instrumentation-and-wait.

## The `[vitest-fork-exit]` sentinel line

`test-helpers/vitest-fork-exit-sentinel.mts`, registered via `test-helpers/vitest.setup.fork-exit-sentinel.mts`
in every backend project's `setupFiles`, writes one synchronous `writeSync(2, …)` line from inside
each fork as it dies — synchronous because the fork's stderr pipe is exactly the channel that
already loses data on an abrupt kill:

```text
[vitest-fork-exit] pid=<n> project=<name> module=<current test file or none> mode=<exit|uncaught|unhandled|signal:SIGTERM|…> code=<n> heapUsedMB=<n> heapLimitMB=<n> heapPctOfLimit=<n> rssMB=<n> uptimeMs=<n> [errorMessage=<message>]
```

`errorMessage` is present only for `mode=uncaught`/`mode=unhandled` — the `Error`'s `message`
(or `String(reason)` for a non-`Error` rejection), whitespace-collapsed and bounded to 200 characters
so one wayward multi-line message can't blow out the line. The durable per-pid JSONL record carries
the unbounded message plus a stack trace bounded to 4000 characters; see
`test-helpers/vitest-fork-exit-error-detail.mts`. The reporter below reads that record back and prints
both an `error:` line (the message) and a `stack:` line (the first 500 raw characters of the stack)
through the same whitespace-collapse/200-char bound (`sanitizeInlineErrorMessage()`), not raw — its
`[vitest-worker-exit-diagnostics]` block goes straight into the CI job log the transient-retry
classifier scans, and a raw multi-line message or stack could otherwise forge a fresh anchored line
that collides with `ci/transient-retry/backend-test-rules.mts`'s line-anchored
`Error: [vitest-pool]: Worker forks emitted error.` / `Caused by: Error: Worker exited unexpectedly`
patterns (#9082; the same collision class documented below for diagnostic-report JSON). The full,
unbounded message and the full 4000-character stack survive only in the uploaded JSONL artifact,
never in the job log — the reporter's `stack:` line is enough to name the throw site, not to read the
whole trace. Before the `errorMessage` field existed, the sentinel line for these two modes carried no
detail at all — the message and stack were captured by the `uncaughtException`/`unhandledRejection`
handlers and then discarded, the exact gap that made `mode=uncaught` failures like PR #9076's and PR
#9080's `backend-tests` runs unexplainable from the sentinel alone.

`heapLimitMB`/`heapPctOfLimit` come from `v8.getHeapStatistics().heap_size_limit` — the fork's own
ceiling, not `heapTotal` (steady-state V8 bookkeeping that sits close to `heapUsed` by design and is
not a limit). `module` is the file the fork was executing when it died, tracked from `beforeEach`/
`afterEach`; a between-tests death (e.g. pool teardown) reports `module=none`.

**The absence of this line for a fork Vitest reports as exited unexpectedly is itself the
diagnostic**: it proves a handler-unreachable death (SIGKILL, SIGSEGV/SIGBUS, or a hard V8 abort),
which eliminates half the hypothesis space on sight.

The sentinel's handlers terminate a fork via `process.reallyExit()`, an undocumented Node internal
(untyped by `@types/node`) — Vitest's module runner permanently stubs `process.exit()` to throw
inside every fork, so the handlers cannot use the public API. `registerForkExitSentinel()` throws
immediately if `process.reallyExit` is ever missing, rather than letting every handler fail silently
on first use. The repo's `.nvmrc` pin is the only guard against a future Node major removing this
internal; see the module header comment in `test-helpers/vitest-fork-exit-sentinel.mts` for the full
reallyExit-vs-process.exit() tradeoff.

`test-helpers/vitest-worker-exit-diagnostics-reporter.mts` prints a per-run `[vitest-worker-exit-diagnostics]`
block on a worker-exit failure, including a `main-process:` resource line (the reporter process, not
the dead fork — do not read this as the fork's own heap), an `unfinished modules:` section (which
module never reached `ended`, closing the gap that let one file's tests silently never run), and a
per-fork roll-up of sentinel records ending in an explicit `forks without an exit sentinel: <n>`
count — the surfaced form of the absence signal above.

## Reading a worker-exit failure: signature → cause

| Signature                                                                                                      | Cause                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sentinel line present, `mode=signal:SIGTERM code=143` (or `SIGINT`/`SIGHUP`)                                   | Normal pool teardown — `ForksPoolWorker.stop()` always kills via `fork.kill()`. This is the everyday "everything worked" signature, not `mode=exit`.                                                                                                                                                                                                                                                                                                               |
| Sentinel line present, `mode=exit`                                                                             | The fork's own event loop drained naturally (not a pool-initiated kill).                                                                                                                                                                                                                                                                                                                                                                                           |
| Sentinel line present, `mode=uncaught` or `mode=unhandled`                                                     | A JS-level exception or rejection escaped a test. Read `errorMessage` for the cause directly, the reporter's `stack:` line (or the durable record's full `errorStack`) for the throw site, `module` for the file, and `heapPctOfLimit` for whether heap pressure was a contributing factor.                                                                                                                                                                        |
| No sentinel line, no diagnostic report, `forks without an exit sentinel` > 0                                   | Unhandleable death — SIGKILL (host/container OOM-killer or an external `kill -9`) or SIGSEGV/SIGBUS before the sentinel could run. Check the `Host pressure diagnostics` step's job-summary output from `ci/host-pressure-diagnostics.sh` to confirm host pressure specifically: cgroup `memory.max`/PSI/OOM-killer journal lines on Linux runners, or `load1 per cpu`, decoded `vm_pressure_level`, `memory_pressure -Q`, and compressor bytes on Darwin runners. |
| No sentinel line, `[vitest-diagnostic-report-summary]` report with a populated `topNativeFrameModule`          | Native/NAPI fatal error (e.g. a Rust panic in `valkey-glide` surfacing as a V8 fatal abort), not a JS heap issue.                                                                                                                                                                                                                                                                                                                                                  |
| No sentinel line, `[vitest-diagnostic-report-summary]` report with `heapLimitMB` populated and no native frame | V8 heap exhaustion (`FATAL ERROR: … JavaScript heap out of memory`) — an unrecoverable fatal crash that never reaches `'uncaughtException'`, so only the report carries evidence, never the sentinel.                                                                                                                                                                                                                                                              |

`ci/vitest-diagnostic-report-summary.mts` (the `Vitest fork diagnostic report summary` step, gated
`if: failure()`) prints only a whitelisted field subset — `trigger`, `event`, `threadId`,
`heapUsedMB`/`heapTotalMB`/`heapLimitMB`, `maxRssMB`, and the top native frame's module path — never
raw report JSON, since native `CHECK failed:` text and arbitrary `nativeStack` symbols are a
collision risk against the classifier predicates in
`ci/transient-retry/backend-test-rules.mts`. The full report directory still uploads as a build
artifact (`vitest-fork-diagnostics-backend-shard-<n>`, `if: failure()`) for anything the summary
whitelist omits.

Also correlate against `[valkey-saturation] pid=<n> …` lines
(`backend/modules/on-error/valkey-saturation.mts`, bounded-sample, test-mode only): a saturation
storm sharing a pid with an unattributed death is the strongest surviving correlate this repo has
seen for this failure (#8072, and the original #8940 forensics), even though attribution alone does
not prove causation. Match the pid, not the timestamp.

## `VITEST_FORK_CRASH_INJECT` — regression coverage only

`test-helpers/vitest-fork-exit-sentinel.integration.test.mts` proves each death mode above is
actually distinguishable by spawning a real `vitest run` subprocess per mode. The setup file honors
`VITEST_FORK_CRASH_INJECT` against an exact allowlist — **`oom | abort | sigkill | throw | reject`**
— and is inert for any other value including unset, mirroring the
`VITEST_FORK_LEAK_DETECTION === 'off'` precedent in `test-helpers/vitest.setup.fork-leak-detection.mts`.
Only that integration spec's fixture project ever sets it; it must never be set in a real backend
run. `throw`/`reject` schedule the fault via `setTimeout(fn, 0)` rather than raising it synchronously
from the `beforeAll` hook that requests it — a synchronous throw there would be caught by Vitest's
own hook-failure handling and never reach `process.on('uncaughtException')`, failing to reproduce the
real production signature. They close the coverage gap that made PR #9076's and PR #9080's
`mode=uncaught` `backend-tests` failures the first occurrences of that signature ever captured with
error detail: before, no fault-injection mode produced a plain, non-OOM uncaught exception or
unhandled rejection at all.

A sixth, `exit`-injected mode was in the original plan and was dropped: there is no way to inject a
self-called `process.exit()` from a fork that isn't either a no-op (`process.reallyExit()` skips the
`'exit'` listener the mode exists to exercise) or a synthesized `process.emit('exit', …)`, which
oxlint's `no-restricted-properties` rule already bans repo-wide. It also would not have modeled
anything real — a real teardown was confirmed by direct observation to die by `SIGTERM`, not by
calling its own `process.exit()`. The integration spec's happy-path case (no injection) exercises
that real teardown signature directly instead.

## Upstream status

Vitest 4.0 replaced tinypool with `ForksPoolWorker` for the forks pool
([#8649](https://github.com/vitest-dev/vitest/issues/8649)); our failure is in that rewritten path.
[#9762](https://github.com/vitest-dev/vitest/issues/9762) — our exact error string — was closed as
_not planned_, with no root cause identified; its own stack trace shows no exit code or signal,
confirming the discarded-exit-code defect is upstream-wide, not specific to this repo.
[#8766](https://github.com/vitest-dev/vitest/issues/8766) is open and is the closest live tracker
(forks-worker termination timeouts, orphaned high-CPU node processes, introduced by the same v4 pool
rewrite). **4.1.10 is `dist-tags.latest`**; the only newer published version is a `5.0.0-beta`, so
there is no upgrade escape hatch today.

## Stopping condition

This is the sixth instrumentation pass on this signature (#6807 → #7016 → #7973 → #8259 → #8072 →
#8940). [#7016](https://github.com/jonathanong/filaments/issues/7016) is an uncounted sibling of
#6807 — same fingerprint, with PR [#7017](https://github.com/jonathanong/filaments/pull/7017) broadening the transient-retry matcher — and belongs in this
chain even though earlier revisions of this section omitted it.
[#9088](https://github.com/jonathanong/filaments/issues/9088) is deliberately **not** part of this
chain: it looked like the same post-pass worker exit but its actual cause was a distinct defect from
anything in the table above — `worker-io`'s prewarm serve path (`serve.mts`) bound a real,
un-closeable TCP listener on a hardcoded fallback port (3002) whenever a test set `NODE_PREWARM`
_without_ also setting `NODE_PREWARM_PORT`, producing intermittent `EADDRINUSE` once a later bind hit
the same port in the shared `isolate: false` fork. #9115 fixed it by binding **only** when
`NODE_PREWARM_PORT` is explicitly set — the production prewarm stages already set it, so that
remains the safe, required setting — and closing the handle on shutdown. Confirm a new occurrence's
signals actually match this table before assuming a
`backend-unit-vitest-worker-exit-after-pass`-shaped failure is automatically this cause.

If the next occurrence arrives with all four signals present — sentinel presence/absence, the
diagnostic-report summary, the host-pressure block, and the valkey-saturation pid attribution — and
still cannot be assigned a cause from the table above, the answer is not a seventh round of
instrumentation. It is: (a) file the captured exit code/signal on
[#8766](https://github.com/vitest-dev/vitest/issues/8766) — precisely the datum that got #9762
closed as not planned — and (b) escalate to a scoped `pool: 'threads'` migration proposal for the
backend projects as tracked follow-up work. `pool: 'threads'` is not a drop-in swap: backend
projects run `isolate: false` with process-level singletons (`@data-stores/psql` pools,
`valkey-glide` clients, the graceful-shutdown registry, AWS mocks) that would collide across workers,
and it would put native `valkey-glide` NAPI bindings inside `worker_threads`.
