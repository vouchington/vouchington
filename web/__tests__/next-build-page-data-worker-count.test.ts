import { describe, expect, it } from 'vitest'

import { nextBuildPageDataWorkerCount } from '../next-build-page-data-worker-count'

// cgroup v2's "max" (unlimited) sentinel, as `process.constrainedMemory()` reports it on real
// uncapped Linux hosts (verified on the fleet's Z890 runners, Node v26.8.1) — not 0, which is
// documented for platforms where cgroups are unavailable entirely. This is UINT64_MAX rounded to
// the nearest representable float64 (2**64), written as the exact digit string that value's own
// `toString()` produces — the true UINT64_MAX literal (…551615) parses to the same float64 but
// fails oxlint's no-loss-of-precision rule, since its canonical round-trip string is this one, not
// itself. The exact magnitude is irrelevant to `nextBuildPageDataWorkerCount`: any value >=
// physicalMemoryBytes must select physicalMemoryBytes, so this is deliberately not
// `Number.MAX_SAFE_INTEGER`-safe.
const CGROUP_V2_UNLIMITED_SENTINEL = 18_446_744_073_709_552_000

describe('nextBuildPageDataWorkerCount', () => {
  it('caps the 12 GiB NucBox below Next cpuCount-1 default and memoryBasedWorkersCount floor', () => {
    // MemTotal from Main CI (web) runs 33588522838 and 33774935536.
    const nucBoxTotalMemoryBytes = 13_066_380 * 1024
    const workers = nextBuildPageDataWorkerCount({
      physicalMemoryBytes: nucBoxTotalMemoryBytes,
      constrainedMemoryBytes: 0,
      cpuCount: 12,
    })

    expect(workers).toBe(1)
    expect(workers).toBeLessThan(12 - 1)
    expect(workers).toBeLessThan(4)
  })

  it('caps the 12 GiB NucBox the same way when the host reports the cgroup v2 unlimited sentinel', () => {
    const nucBoxTotalMemoryBytes = 13_066_380 * 1024
    expect(
      nextBuildPageDataWorkerCount({
        physicalMemoryBytes: nucBoxTotalMemoryBytes,
        constrainedMemoryBytes: CGROUP_V2_UNLIMITED_SENTINEL,
        cpuCount: 12,
      }),
    ).toBe(1)
  })

  it('uses the cgroup memory limit when it is lower than physical memory', () => {
    // jong-Z890-EAGLE-WIFI7-PLUS-32GB: real MemoryHigh=9_891_975_168, MemoryMax=13_189_304_320
    // (both verified via systemctl; runner-resource-controls.sh resolves MemoryHigh=30%/
    // MemoryMax=40% against this host's 30.71 GiB physical RAM). `process.constrainedMemory()`
    // returns min(memory.max, memory.high) on cgroup v2 (verified empirically — see
    // web/next.config.ts), which is MemoryHigh here, not MemoryMax. See
    // docs/development/reference-host-locks-nextjs-build-worker-reserve.md fleet table; this is
    // the 1-worker row in the build-duration table there.
    expect(
      nextBuildPageDataWorkerCount({
        physicalMemoryBytes: 30.71 * 1024 ** 3,
        constrainedMemoryBytes: 9_891_975_168,
        cpuCount: 24,
      }),
    ).toBe(1)
  })

  it('falls back to physical memory when no cgroup limit is reported', () => {
    expect(
      nextBuildPageDataWorkerCount({
        physicalMemoryBytes: 64 * 1024 ** 3,
        constrainedMemoryBytes: 0,
        cpuCount: 16,
      }),
    ).toBe(15)
  })

  it('falls back to physical memory when the host reports the cgroup v2 unlimited sentinel', () => {
    expect(
      nextBuildPageDataWorkerCount({
        physicalMemoryBytes: 64 * 1024 ** 3,
        constrainedMemoryBytes: CGROUP_V2_UNLIMITED_SENTINEL,
        cpuCount: 16,
      }),
    ).toBe(15)
  })

  it('does not let a cgroup limit above physical memory increase workers', () => {
    expect(
      nextBuildPageDataWorkerCount({
        physicalMemoryBytes: 64 * 1024 ** 3,
        constrainedMemoryBytes: 128 * 1024 ** 3,
        cpuCount: 64,
      }),
    ).toBe(36)
  })

  it('uses a single worker when reserved memory leaves no page-data budget', () => {
    expect(
      nextBuildPageDataWorkerCount({
        physicalMemoryBytes: 8 * 1024 ** 3,
        constrainedMemoryBytes: 0,
        cpuCount: 4,
      }),
    ).toBe(1)
  })

  it('never returns fewer than one worker', () => {
    expect(
      nextBuildPageDataWorkerCount({
        physicalMemoryBytes: 4 * 1024 ** 3,
        constrainedMemoryBytes: 0,
        cpuCount: 1,
      }),
    ).toBe(1)
  })

  it('computes the 62 GiB Z890 worker count seen in the fleet table', () => {
    // jong-Z890-EAGLE-WIFI7-PLUS: 24 CPUs, 62.16 GiB physical, real MemoryHigh=20_023_885_824,
    // MemoryMax=26_698_514_432 (both verified via systemctl; runner-resource-controls.sh resolves
    // MemoryHigh=30%/MemoryMax=40% against this host's physical RAM).
    // `process.constrainedMemory()` returns min(memory.max, memory.high) on cgroup v2 (verified
    // empirically — see web/next.config.ts), which is MemoryHigh here, not MemoryMax. See
    // docs/development/reference-host-locks-nextjs-build-worker-reserve.md fleet table; this is
    // the 5-worker row in the build-duration table there.
    expect(
      nextBuildPageDataWorkerCount({
        physicalMemoryBytes: 62.16 * 1024 ** 3,
        constrainedMemoryBytes: 20_023_885_824,
        cpuCount: 24,
      }),
    ).toBe(5)
  })

  it('computes the 27.15 GiB A6 worker count seen in the fleet table', () => {
    // jonathan-ong-A6: 16 CPUs, 27.15 GiB physical, no cgroup cap (MemoryHigh/MemoryMax both ∞ —
    // real uncapped hosts report the cgroup v2 unlimited sentinel, not 0). Memory-bound, unlike the
    // CPU-bound 64 GiB/16-CPU case above. See
    // docs/development/reference-host-locks-nextjs-build-worker-reserve.md fleet table; this is
    // the 11-worker row in the build-duration table there.
    expect(
      nextBuildPageDataWorkerCount({
        physicalMemoryBytes: 27.15 * 1024 ** 3,
        constrainedMemoryBytes: CGROUP_V2_UNLIMITED_SENTINEL,
        cpuCount: 16,
      }),
    ).toBe(11)
  })
})
