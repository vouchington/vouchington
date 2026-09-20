import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface SpawnCall {
  args: string[]
  env: NodeJS.ProcessEnv
}

type MockSpawn = (
  command: string,
  args?: readonly string[],
  options?: { env?: NodeJS.ProcessEnv },
) => ReturnType<typeof import('node:child_process').spawn>

type MockSpawnSync = () => ReturnType<typeof import('node:child_process').spawnSync>

interface MockChildProcess extends EventEmitter {
  stderr: EventEmitter
}

const spawnCalls: SpawnCall[] = []
const buildEvents: string[] = []

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
      spawn: vi.fn<MockSpawn>((_command, args, options) => {
        const buildName = Array.isArray(args) ? args.map(String).join(' ') : ''
        spawnCalls.push({
          args: Array.isArray(args) ? args.map(String) : [],
          env:
            typeof options === 'object' && options !== null && 'env' in options
              ? (options.env ?? {})
              : {},
        })
        const child = new EventEmitter() as unknown as MockChildProcess
        child.stderr = new EventEmitter()
        buildEvents.push(`start:${buildName}`)
        queueMicrotask(() => {
          buildEvents.push(`exit:${buildName}`)
          child.emit('close', 0)
        })
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

describe('setup-web-integration', () => {
  const originalEnv = { ...process.env }

  beforeEach(async () => {
    vi.resetModules()
    const fs = await import('node:fs')

    spawnCalls.length = 0
    buildEvents.length = 0
    vi.mocked(fs.mkdirSync).mockClear()
    // mockReset (not mockClear) -- the write-failure test below installs a throwing
    // mockImplementation that would otherwise leak into every later test in this file.
    vi.mocked(fs.writeFileSync).mockReset()
    process.env = { ...originalEnv }
    delete process.env.IMAGE_ORIGIN
    delete process.env.IMAGE_LAMBDA_PORT
    delete process.env.VOUCHINGTON_SETUP_WEB_TIMINGS_JSON
    delete process.env.NEXT_PUBLIC_ASSET_PREFIX
    delete process.env.NEXT_PUBLIC_API_BASE_URL
    delete process.env.PORT
    delete process.env.NEXT_PORT
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('passes the explicit IMAGE_ORIGIN into the production web build', async () => {
    process.env.IMAGE_ORIGIN = 'http://images.example.test'

    const modulePath = './setup-web-integration.mts?explicit-image-origin'
    await import(modulePath)

    expect(webBuildEnv().IMAGE_ORIGIN).toBe('http://images.example.test')
  })

  it('marks the production web build as a test build', async () => {
    const modulePath = './setup-web-integration.mts?test-build-env'
    await import(modulePath)

    expect(webBuildEnv().NEXT_TEST_BUILD).toBe('1')
  })

  it('builds the Cloudflare Worker before starting the Next build', async () => {
    const modulePath = './setup-web-integration.mts?sequential-builds'
    await import(modulePath)

    expect(buildEvents).toEqual([
      'start:--dir cloudflare-worker build',
      'exit:--dir cloudflare-worker build',
      'start:--dir web build',
      'exit:--dir web build',
    ])
  })

  it('allows callers to opt out of the test build flag', async () => {
    process.env.NEXT_TEST_BUILD = '0'

    const modulePath = './setup-web-integration.mts?test-build-env-override'
    await import(modulePath)

    expect(webBuildEnv().NEXT_TEST_BUILD).toBe('0')
  })

  it('derives IMAGE_ORIGIN from IMAGE_LAMBDA_PORT for integration builds', async () => {
    process.env.IMAGE_LAMBDA_PORT = '3109'

    const modulePath = './setup-web-integration.mts?image-lambda-port'
    await import(modulePath)

    expect(webBuildEnv().IMAGE_ORIGIN).toBe('http://localhost:3109')
  })

  it('omits NEXT_PUBLIC_API_BASE_URL and NEXT_PUBLIC_ASSET_PREFIX from the build by default', async () => {
    // Neither is derived from PORT/NEXT_PORT: a per-shard port baked into either
    // would make the build unshareable across shards/runs (#10990). Assets are
    // served same-origin through the Cloudflare Worker when assetPrefix is
    // unset, and the server-side API base URL is resolved at runtime via
    // process.env.API_BASE_URL, which every real caller already sets per shard.
    process.env.PORT = '31234'
    process.env.NEXT_PORT = '31235'

    const modulePath = './setup-web-integration.mts?no-port-derivation'
    await import(modulePath)

    const env = webBuildEnv()
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBeUndefined()
    expect(env.NEXT_PUBLIC_ASSET_PREFIX).toBeUndefined()
  })

  it('passes through explicit NEXT_PUBLIC_API_BASE_URL and NEXT_PUBLIC_ASSET_PREFIX unchanged', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test'
    process.env.NEXT_PUBLIC_ASSET_PREFIX = 'https://assets.example.test'

    const modulePath = './setup-web-integration.mts?explicit-port-env-passthrough'
    await import(modulePath)

    const env = webBuildEnv()
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe('https://api.example.test')
    expect(env.NEXT_PUBLIC_ASSET_PREFIX).toBe('https://assets.example.test')
  })

  it('writes a partial timing report after every step, not just once at the end (issue #10937)', async () => {
    const fs = await import('node:fs')
    const timingPath = '/tmp/setup-web-timings-partial.json'
    process.env.VOUCHINGTON_SETUP_WEB_TIMINGS_JSON = timingPath

    const modulePath = './setup-web-integration.mts?timing-report-partial'
    await import(modulePath)

    const calls = vi
      .mocked(fs.writeFileSync)
      .mock.calls.filter(([path]) => path === timingPath)
      .map(([, json]) => JSON.parse(String(json)) as { timings: Record<string, number> })

    // One write before any step starts, plus one after each of cache-cleanup,
    // cloudflare-worker-build, next-build, and standalone-asset-copy: a watchdog SIGKILL partway
    // through the build still leaves whichever of these writes already landed on disk.
    expect(calls.length).toBeGreaterThanOrEqual(5)
    expect(calls[0]!.timings).toEqual({})

    const afterCloudflareBuildOnly = calls.find(
      report => 'cloudflare-worker-build' in report.timings && !('next-build' in report.timings),
    )
    expect(afterCloudflareBuildOnly).toBeDefined()

    const afterNextBuildOnly = calls.find(
      report => 'next-build' in report.timings && !('standalone-asset-copy' in report.timings),
    )
    expect(afterNextBuildOnly).toBeDefined()
  })

  it('does not abort the build when the timing report write fails', async () => {
    const fs = await import('node:fs')
    process.env.VOUCHINGTON_SETUP_WEB_TIMINGS_JSON = '/tmp/setup-web-timings-write-failure.json'
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('EIO: simulated timing-report write failure')
    })

    const modulePath = './setup-web-integration.mts?timing-report-write-failure'

    await expect(import(modulePath)).resolves.toBeDefined()
    expect(buildEvents).toContain('exit:--dir web build')
  })

  function webBuildEnv(): NodeJS.ProcessEnv {
    const call = spawnCalls.find(({ args }) => args.join(' ') === '--dir web build')

    expect(call).toBeDefined()
    return call!.env
  }
})
