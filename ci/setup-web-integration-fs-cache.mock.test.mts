import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MockSpawn = (
  command: string,
  args?: readonly string[],
  options?: { env?: NodeJS.ProcessEnv },
) => ReturnType<typeof import('node:child_process').spawn>

type MockSpawnSync = () => ReturnType<typeof import('node:child_process').spawnSync>

interface MockChildProcess extends EventEmitter {
  stderr: EventEmitter
}

vi.mock<typeof import('node:fs')>(
  import('node:fs'),
  () =>
    ({
      cpSync: vi.fn<typeof import('node:fs').cpSync>(),
      existsSync: vi.fn<typeof import('node:fs').existsSync>(() => true),
      mkdirSync: vi.fn<typeof import('node:fs').mkdirSync>(),
      renameSync: vi.fn<typeof import('node:fs').renameSync>(),
      rmSync: vi.fn<typeof import('node:fs').rmSync>(),
      writeFileSync: vi.fn<typeof import('node:fs').writeFileSync>(),
    }) as unknown as typeof import('node:fs'),
)

vi.mock<typeof import('node:child_process')>(
  import('node:child_process'),
  () =>
    ({
      spawn: vi.fn<MockSpawn>(() => {
        const child = new EventEmitter() as unknown as MockChildProcess
        child.stderr = new EventEmitter()
        queueMicrotask(() => child.emit('close', 0))
        return child as unknown as ReturnType<typeof import('node:child_process').spawn>
      }),
      spawnSync: vi.fn<MockSpawnSync>(() => ({
        error: undefined,
        output: [],
        pid: 0,
        signal: null,
        status: 0,
        stderr: Buffer.alloc(0),
        stdout: Buffer.alloc(0),
      })),
    }) as unknown as typeof import('node:child_process'),
)

describe('setup-web-integration Turbopack build cache CI gate (#11431)', () => {
  const originalEnv = { ...process.env }

  beforeEach(async () => {
    vi.resetModules()
    const fs = await import('node:fs')

    vi.mocked(fs.existsSync).mockReset().mockReturnValue(true)
    vi.mocked(fs.renameSync).mockClear()
    vi.mocked(fs.rmSync).mockClear()
    vi.mocked(fs.writeFileSync).mockReset()
    process.env = { ...originalEnv }
    delete process.env.WEB_BUILD_FS_CACHE_ENABLED
    delete process.env.FILAMENTS_SETUP_WEB_TIMINGS_JSON
    delete process.env.CI
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('clears stale runtime output while preserving the Next.js build cache when the flag is enabled in CI', async () => {
    const fs = await import('node:fs')
    process.env.CI = 'true'
    process.env.WEB_BUILD_FS_CACHE_ENABLED = 'true'

    const modulePath = './setup-web-integration.mts?fs-cache-enabled'
    await import(modulePath)

    expect(fs.renameSync).toHaveBeenCalledWith(
      expect.stringContaining('web/.next/cache'),
      expect.stringMatching(/\.next\.cache\.tmp$/),
    )
    expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining('web/.next'), {
      force: true,
      recursive: true,
    })
    expect(fs.renameSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.next\.cache\.tmp$/),
      expect.stringContaining('web/.next/cache'),
    )
  })

  it('reports the cache as disabled, and skips preserving it, when neither CI nor the repo variable is set', async () => {
    const fs = await import('node:fs')

    // Matches a developer's local `pnpm run test:playwright` / `test:integration:web` invocation:
    // no GitHub repository variable reaches those lifecycle hooks, so the cache stays off by
    // default, identical to web/next.config.ts's own unconditional read of the same variable.
    const modulePath = './setup-web-integration.mts?fs-cache-default-outside-ci'
    await import(modulePath)

    expect(fs.renameSync).not.toHaveBeenCalled()
  })

  it('reports a miss, not a hit, on the first enabled run after a run with the flag off', async () => {
    const fs = await import('node:fs')
    process.env.CI = 'true'
    process.env.WEB_BUILD_FS_CACHE_ENABLED = 'true'
    process.env.FILAMENTS_SETUP_WEB_TIMINGS_JSON = '/tmp/setup-web-timings-first-enabled-run.json'

    // A disabled run still leaves the near-empty (~260 KB) build metadata that lives directly
    // under web/.next/cache without ever populating its turbopack subdirectory -- checking the
    // parent directory's existence alone would misreport this first enabled run as a "hit" (#11431
    // review).
    vi.mocked(fs.existsSync).mockImplementation(path => !String(path).includes('/cache/turbopack'))

    const modulePath = './setup-web-integration.mts?fs-cache-first-enabled-run'
    await import(modulePath)

    const calls = vi.mocked(fs.writeFileSync).mock.calls
    const [, reportJson] = calls[calls.length - 1]
    const report = JSON.parse(String(reportJson)) as { nextBuildCache: string }
    expect(report.nextBuildCache).toBe('miss')
  })

  it('writes build timing and cache status when requested', async () => {
    const fs = await import('node:fs')
    process.env.CI = 'true'
    process.env.WEB_BUILD_FS_CACHE_ENABLED = 'true'
    process.env.FILAMENTS_SETUP_WEB_TIMINGS_JSON = '/tmp/setup-web-timings.json'

    const modulePath = './setup-web-integration.mts?timing-report'
    await import(modulePath)

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/setup-web-timings.json',
      expect.stringContaining('"nextBuildCache": "hit"'),
    )
    // The final write carries every step's timing plus the overall total.
    const calls = vi.mocked(fs.writeFileSync).mock.calls
    const [, reportJson] = calls[calls.length - 1]
    const report = JSON.parse(String(reportJson)) as {
      nextBuildCache: string
      timings: Record<string, number>
    }
    expect(report.nextBuildCache).toBe('hit')
    expect(report.timings['next-build']).toBeGreaterThanOrEqual(0)
    expect(report.timings['cloudflare-worker-build']).toBeGreaterThanOrEqual(0)
    expect(report.timings['standalone-asset-copy']).toBeGreaterThanOrEqual(0)
    expect(report.timings.total).toBeGreaterThanOrEqual(0)
  })

  it('reports the cache as disabled, and skips preserving it, when the flag is off in CI', async () => {
    const fs = await import('node:fs')
    process.env.CI = 'true'
    process.env.FILAMENTS_SETUP_WEB_TIMINGS_JSON = '/tmp/setup-web-timings-disabled.json'

    const modulePath = './setup-web-integration.mts?timing-report-disabled'
    await import(modulePath)

    expect(fs.renameSync).not.toHaveBeenCalled()
    const calls = vi.mocked(fs.writeFileSync).mock.calls
    const [, reportJson] = calls[calls.length - 1]
    const report = JSON.parse(String(reportJson)) as { nextBuildCache: string }
    expect(report.nextBuildCache).toBe('disabled')
  })
})
