/**
 * Caps Next.js `experimental.cpus`, which sizes the one static-worker pool Next creates for both
 * the "Collecting page data" and later "Generating static pages" build phases (same
 * `numberOfWorkers` value, passed to `createStaticWorker` and reused as `numWorkers` for export —
 * see `getNumberOfWorkers` and the `exportApp` call sites in `next/dist/esm/build/index.js`
 * (Next 16.x as pinned in `web/package.json`).
 *
 * Next 16 defaults that pool to `os.cpus().length - 1` and only treats a
 * different `experimental.cpus` as a user override. Built-in
 * `memoryBasedWorkersCount` still enforces a 4-worker minimum, which is too
 * high after a ~6.5 GiB compile on a 12 GiB host.
 */

const GIB = 1024 ** 3
/**
 * Sized against this build's own compile footprint plus the OS/runner-agent baseline; not
 * against concurrent-build overcommit. Do not lower this without re-measuring
 * docs/development/reference-host-locks-nextjs-build-worker-reserve.md's fleet and build-duration
 * tables.
 */
const RESERVED_GIB_FOR_COMPILE_AND_OS_BASELINE = 10
/** Surviving page-data workers were ~300–650 MiB RSS; 1.5 GiB leaves headroom. */
const GIB_PER_PAGE_DATA_WORKER = 1.5

export function nextBuildPageDataWorkerCount(input: {
  physicalMemoryBytes: number
  constrainedMemoryBytes: number
  cpuCount: number
}): number {
  const cpuBound = Math.max(1, input.cpuCount - 1)
  // `constrainedMemoryBytes` is 0 only where cgroups are unavailable (and never
  // negative in practice); an uncapped cgroup v2 host
  // reports the "max" sentinel (UINT64_MAX on Linux), not 0, so `|| Infinity` is what actually
  // falls back to physical memory there — the cgroup value is never trusted above physical.
  const effectiveMemoryBytes = Math.min(
    input.physicalMemoryBytes,
    input.constrainedMemoryBytes || Infinity,
  )
  const effectiveMemoryGiB = effectiveMemoryBytes / GIB
  const memBound = Math.max(
    1,
    Math.floor(
      (effectiveMemoryGiB - RESERVED_GIB_FOR_COMPILE_AND_OS_BASELINE) / GIB_PER_PAGE_DATA_WORKER,
    ),
  )
  return Math.min(cpuBound, memBound)
}
