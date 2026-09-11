# Next.js build worker reserve: fleet measurements

Backs the `RESERVED_GIB_FOR_COMPILE_AND_OS_BASELINE` constant in
[`web/next-build-page-data-worker-count.ts`](../../web/next-build-page-data-worker-count.ts), which
[Per-User Host Locks](host-locks.md#coverage) points to. Re-measure both tables below before
changing that constant.

## Where the 10 GiB goes

Roughly:

- **~6.5 GiB — this build's own compile footprint.** The historical driver: it alone OOM-killed
  `next build` on the 12 GiB NucBox at the old 11-worker default (Main CI web runs 33588522838 with
  11 workers, 33774935536 with the previous 2-worker cap — see [host-locks.md](host-locks.md)).
  Present on every host regardless of cgroups.
- **~3–4 GiB — OS and runner-agent baseline.** Measured on the NucBox (`free -h`, 2026-09-07, with
  GitHub Actions running and no build active): 4.2 GiB used, 8.3 GiB available of 12 GiB physical.

These two alone already account for roughly the whole reserve on the smallest fleet host (NucBox,
12.46 GiB physical) — not a precise derivation of 10 specifically, but enough to show the reserve
isn't oversized there. `next build` fails closed against a second concurrent Next build
(`VOUCHA_BUILD_LOCK_ON_ACQUIRE_TIMEOUT=fail`, `VOUCHA_BUILD_LOCK_WAIT_SECONDS=300`, set on the
`build` script in [`web/package.json`](../../web/package.json)), so this reserve is not sized
against concurrent-build overcommit.

## Fleet shapes

Self-hosted Linux runners are registered in two GitHub registries against the same physical hosts
(org `vouchington` and repo `jonathanong/filaments`), so each host runs more `actions.runner.*`
systemd services than either registry alone suggests. Measured via `systemctl`:

| Host                              | CPUs | Physical  | `MemoryHigh` | `MemoryMax` | Runner services | Committed ceiling |
| --------------------------------- | ---- | --------- | ------------ | ----------- | --------------- | ----------------- |
| `jong-Z890-EAGLE-WIFI7-PLUS`      | 24   | 62.16 GiB | 18.65 GiB    | 24.86 GiB   | 20              | 497 GiB           |
| `jong-Z890-EAGLE-WIFI7-PLUS-32GB` | 24   | 30.71 GiB | 9.21 GiB     | 12.28 GiB   | 15              | 184 GiB           |
| `jonathan-ong-A6`                 | 16   | 27.15 GiB | ∞            | ∞           | 4               | —                 |
| `jonathan-ong-NucBox-M6-Ultra`    | 12   | 12.46 GiB | ∞            | ∞           | 2               | —                 |

`systemd`'s `MemoryMax=40%` (set by `runner-resource-controls.sh` in
`vouchington-machines`) is a per-unit **ceiling**, resolved against total host memory
independently for each unit — not a reservation. `MemoryHigh=30%` is a lower, softer
reclaim/throttle threshold set alongside it on every unit. The table's `Committed ceiling` column is
this accounting arithmetic (per-unit `MemoryMax` × runner-service count): idle services don't hold
that memory, so it is not resident pressure and not what sizes this reserve (see below).

**`process.constrainedMemory()` reads `min(memory.max, memory.high)`, not just `memory.max`** —
verified empirically on a real runner host (`jong-z890-eagle-wifi7-plus.local`): a `systemd-run
--scope` with both properties set returns the smaller one; with only one set, it returns that one.
Since this fleet's policy always sets both, `next.config.ts`'s `constrainedMemoryBytes` is actually
each capped host's `MemoryHigh`, not its `MemoryMax` — the effective memory the worker-count
formula sees is 18.65 GiB on the 62 GiB Z890 and 9.21 GiB on the 32 GiB Z890, not 24.86/12.28 GiB.
These are the real fleet shapes `web/__tests__/next-build-page-data-worker-count.test.ts` pins (as
`MemoryHigh` on the capped hosts, matching what the code actually receives); `next build` itself still fails closed
against a second concurrent Next build under the same OS user (see
[Where the 10 GiB goes](#where-the-10-gib-goes)), so this reserve is not derived from or sized
against runner over-registration.

## Build duration shows timeout headroom, not worker-count neutrality

20 `build-web-targets` step durations sampled from four recent `main-web.yml` runs (34159010978,
34155759735, 34140118275, 34139084155), grouped by the page-data worker count the formula produces
on that host:

| Host                              | Workers | `build-web-targets` step durations (s) |
| --------------------------------- | ------- | -------------------------------------- |
| `jong-Z890-EAGLE-WIFI7-PLUS`      | 5       | 21, 36, 41, 47, 48, 49, 65, 123        |
| `jong-Z890-EAGLE-WIFI7-PLUS-32GB` | 1       | 31, 39, 42, 42, 43, 44, 66, 82, 96     |
| `jonathan-ong-A6`                 | 11      | 62, 71, 89                             |

Samples span different hosts with uncontrolled `.next/cache` state and host contention, so they
cannot isolate worker count's effect on wall time. What they do show: every sample (21–123s) sits
well under the 360-second `expensive-build` command timeout — median 47.5s, ~7.6x headroom. These
are full `build-web-targets` step durations, so they already include both phases `experimental.cpus`
governs — "Collecting page data" and "Generating static pages" (Next reuses the same worker pool for
both; see [`web/next-build-page-data-worker-count.ts`](../../web/next-build-page-data-worker-count.ts)).
On this evidence worker count is not the binding constraint on build duration today, so there is no
timeout pressure motivating a change to the reserve.

`jonathan-ong-NucBox-M6-Ultra` — the fourth host in the fleet-shapes table above, and the smallest —
has no row here: checked via each of the four runs' per-job `runner_name`, it did not execute
`build-web-targets` in any of them. That is a fact about which runner GitHub's scheduler picked for
these four samples, not a claim that NucBox is fast or unconstrained. NucBox's evidence for this
reserve is the OOM incident in [Where the 10 GiB goes](#where-the-10-gib-goes) (runs 33588522838 and
33774935536), a failure mode a duration sample from a run that didn't OOM cannot surface anyway.

Revisit the reserve if build durations approach the 360s cap.
