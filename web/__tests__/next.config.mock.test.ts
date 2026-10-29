import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const {
  constrainedMemoryBytes,
  cpuCount,
  physicalMemoryBytes,
  sentryConfigCall,
  withSentryConfig,
} = vi.hoisted(() => {
  const physicalMemoryBytes = 64 * 1024 ** 3
  const constrainedMemoryBytes = 13_189_304_320
  const cpuCount = 24
  const sentryConfigCall: { nextConfig?: unknown; sentryBuildOptions?: unknown } = {}
  const constrainedProcess = Object.create(process) as NodeJS.Process
  Object.defineProperty(constrainedProcess, 'constrainedMemory', {
    value: () => constrainedMemoryBytes,
  })
  vi.stubGlobal('process', constrainedProcess)

  return {
    constrainedMemoryBytes,
    cpuCount,
    physicalMemoryBytes,
    sentryConfigCall,
    withSentryConfig: vi.fn<(nextConfig: unknown, sentryBuildOptions?: unknown) => unknown>(
      (nextConfig, sentryBuildOptions) => {
        sentryConfigCall.nextConfig = nextConfig
        sentryConfigCall.sentryBuildOptions = sentryBuildOptions
        return nextConfig
      },
    ),
  }
})
vi.mock(import('node:os'), () => {
  const mockedOs = {
    totalmem: () => physicalMemoryBytes,
    cpus: () => Array.from({ length: cpuCount }, () => ({})),
  }
  return {
    ...mockedOs,
    default: mockedOs,
  } as unknown as typeof import('node:os')
})
vi.mock(
  import('@sentry/nextjs/config'),
  () =>
    ({
      withSentryConfig,
    }) as unknown as typeof import('@sentry/nextjs/config'),
)

import loadConfig from '../next.config'
import { nextBuildPageDataWorkerCount } from '../next-build-page-data-worker-count'
import { PHASE_PRODUCTION_SERVER } from 'next/constants'

const config = loadConfig(PHASE_PRODUCTION_SERVER)

describe('next.config', () => {
  afterEach(() => vi.doUnmock(import('sharp')))

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it.each(['0.34.5', 'invalid'])(
    'rejects unsafe Sharp %s while loading the config',
    async version => {
      vi.resetModules()
      vi.doMock(
        import('sharp'),
        () =>
          ({
            default: { versions: { sharp: version } },
          }) as unknown as typeof import('sharp'),
      )
      await expect(
        vi.importActual<typeof import('../next.config')>('../next.config'),
      ).rejects.toThrow('requires sharp >=0.35.0')
    },
  )

  it.each(['0.35.0', '1.0.0'])('loads the config with secure Sharp %s', async version => {
    vi.resetModules()
    vi.doMock(
      import('sharp'),
      () =>
        ({
          default: { versions: { sharp: version } },
        }) as unknown as typeof import('sharp'),
    )
    await withSentryConfig.withImplementation(
      nextConfig => nextConfig,
      async () => {
        const loaded = await vi.importActual<typeof import('../next.config')>('../next.config')
        expect(loaded.default(PHASE_PRODUCTION_SERVER)).toMatchObject({
          experimental: { useTypeScriptCli: false },
        })
      },
    )
  })

  it('does not set webpack config (Turbopack is the bundler)', () => {
    expect(config.webpack).toBeUndefined()
  })

  it('optimizes icon package imports', () => {
    expect(config.experimental?.optimizePackageImports).toEqual(
      expect.arrayContaining(['lucide-react', 'recharts']),
    )
  })

  it('uses the TypeScript compiler API instead of the TypeScript CLI', () => {
    expect(config.experimental?.useTypeScriptCli).toBe(false)
  })

  it('caps page-data workers from the stricter host or cgroup memory limit', () => {
    const expectedWorkers = nextBuildPageDataWorkerCount({
      physicalMemoryBytes,
      constrainedMemoryBytes,
      cpuCount,
    })

    expect(expectedWorkers).toBe(1)
    expect(config.experimental?.cpus).toBe(expectedWorkers)
  })

  it('sets CORS headers for all Next static assets', async () => {
    const headersConfig = config.headers
    expect(typeof headersConfig).toBe('function')
    if (!headersConfig) throw new Error('next.config headers() is required for static asset CORS')

    const headers = await headersConfig()

    expect(headers).toEqual(
      expect.arrayContaining([
        {
          source: '/_next/static/:path*',
          headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
        },
      ]),
    )
  })

  it('keeps client monitoring and gates source map uploads on the trusted build flag', () => {
    expect(sentryConfigCall.nextConfig).toBe(config)
    expect(sentryConfigCall.sentryBuildOptions).toMatchObject({
      org: 'vouchington',
      project: 'vouchington-web',
      sourcemaps: { disable: true },
    })
  })
})
