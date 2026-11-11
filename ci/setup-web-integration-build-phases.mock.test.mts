import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

type MockSpawn = (
  command: string,
  args?: readonly string[],
  options?: { env?: NodeJS.ProcessEnv },
) => ReturnType<typeof import('node:child_process').spawn>

interface MockChildProcess extends EventEmitter {
  stderr: EventEmitter
}

const WORKER_COMMAND = '--dir cloudflare-worker build'
const STORYBOOK_COMMAND =
  '--dir web exec storybook build --output-dir storybook-static --disable-telemetry'

vi.mock<typeof import('node:fs')>(import('node:fs'), async original => {
  const actual = await original()
  return {
    ...actual,
    cpSync: vi.fn<typeof actual.cpSync>(),
    existsSync: vi.fn<typeof actual.existsSync>(() => true),
    mkdirSync: vi.fn<typeof actual.mkdirSync>(),
    readFileSync: vi.fn<typeof actual.readFileSync>(
      () => '<script>window.test = true</script>' as never,
    ),
    renameSync: vi.fn<typeof actual.renameSync>(),
    rmSync: vi.fn<typeof actual.rmSync>(),
    writeFileSync: vi.fn<typeof actual.writeFileSync>(),
  } as unknown as typeof import('node:fs')
})
vi.mock<typeof import('node:child_process')>(
  import('node:child_process'),
  async original =>
    ({
      ...(await original()),
      spawn: vi.fn<MockSpawn>(),
    }) as unknown as typeof import('node:child_process'),
)

describe('web integration build phases', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('WEB_BUILD_FS_CACHE_ENABLED', 'false')
    const fs = await import('node:fs')
    const { spawn } = await import('node:child_process')
    vi.mocked(fs.cpSync).mockClear()
    vi.mocked(fs.rmSync).mockReset()
    vi.mocked(fs.writeFileSync).mockReset()
    vi.mocked(spawn).mockReset()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('keeps production build memory peaks sequential before copying assets', async () => {
    const fs = await import('node:fs')
    const { spawn } = await import('node:child_process')
    const held = new Map<string, MockChildProcess>()
    const workerStarted = Promise.withResolvers<MockChildProcess>()
    const storybookStarted = Promise.withResolvers<MockChildProcess>()
    let releasing = false
    vi.mocked(spawn).mockImplementation((_command, args) => {
      const name = Array.isArray(args) ? args.join(' ') : ''
      const child = new EventEmitter() as unknown as MockChildProcess
      child.stderr = new EventEmitter()
      if (!releasing && (name === WORKER_COMMAND || name === STORYBOOK_COMMAND)) {
        held.set(name, child)
        if (name === WORKER_COMMAND) workerStarted.resolve(child)
        else storybookStarted.resolve(child)
      } else queueMicrotask(() => child.emit('close', 0))
      return child as unknown as ReturnType<typeof spawn>
    })

    const loading = import('./setup-web-integration.mts')
    const outcome = loading.then(() => undefined).catch((err: unknown) => err)
    try {
      const worker = await workerStarted.promise
      expect(held.size).toBe(1)
      expect(spawn).toHaveBeenCalledTimes(1)
      expect(fs.cpSync).not.toHaveBeenCalled()
      worker.emit('close', 0)
      const storybook = await storybookStarted.promise
      expect(spawn).toHaveBeenCalledTimes(2)
      expect(fs.cpSync).not.toHaveBeenCalled()
      storybook.emit('close', 0)
      expect(await outcome).toBeUndefined()
      expect(spawn).toHaveBeenCalledTimes(3)
      expect(fs.cpSync).toHaveBeenCalled()
    } finally {
      releasing = true
      for (const child of held.values()) child.emit('close', 0)
      await outcome
    }
  })

  it.each([7, 0])(
    'stops later builds and records timings with worker exit %i',
    async workerExit => {
      const fs = await import('node:fs')
      const { spawn } = await import('node:child_process')
      const timingPath = '/tmp/setup-web-timings-build-failure.json'
      vi.stubEnv('VOUCHINGTON_SETUP_WEB_TIMINGS_JSON', timingPath)
      vi.mocked(spawn).mockImplementation((_command, args) => {
        const name = Array.isArray(args) ? args.join(' ') : ''
        const child = new EventEmitter() as unknown as MockChildProcess
        child.stderr = new EventEmitter()
        queueMicrotask(() => child.emit('close', name === WORKER_COMMAND ? workerExit : 9))
        return child as unknown as ReturnType<typeof spawn>
      })

      await expect(import('./setup-web-integration.mts')).rejects.toMatchObject({
        message:
          workerExit === 7
            ? `pnpm ${WORKER_COMMAND} failed with exit code 7`
            : `pnpm ${STORYBOOK_COMMAND} failed with exit code 9`,
      })
      expect(spawn).toHaveBeenCalledTimes(workerExit === 7 ? 1 : 2)
      expect(fs.cpSync).not.toHaveBeenCalled()
      const reports = vi
        .mocked(fs.writeFileSync)
        .mock.calls.filter(([path]) => path === timingPath)
        .map(
          ([, json]) => JSON.parse(stringFromUnknown(json)) as { timings: Record<string, number> },
        )
      expect(Object.keys(reports.at(-1)!.timings)).toEqual(
        workerExit === 7
          ? ['cache-cleanup', 'cloudflare-worker-build']
          : ['cache-cleanup', 'cloudflare-worker-build', 'storybook-build'],
      )
    },
  )

  it('records cleanup failure before starting either builder', async () => {
    const fs = await import('node:fs')
    const { spawn } = await import('node:child_process')
    const failure = new Error('Owned cache cleanup failed')
    const timingPath = '/tmp/setup-web-timings-cleanup-failure.json'
    vi.stubEnv('VOUCHINGTON_SETUP_WEB_TIMINGS_JSON', timingPath)
    vi.mocked(fs.rmSync).mockImplementationOnce(() => {
      throw failure
    })

    await expect(import('./setup-web-integration.mts')).rejects.toBe(failure)
    expect(spawn).not.toHaveBeenCalled()
    const reports = vi
      .mocked(fs.writeFileSync)
      .mock.calls.filter(([path]) => path === timingPath)
      .map(([, json]) => JSON.parse(stringFromUnknown(json)) as { timings: Record<string, number> })
    expect(reports.at(-1)?.timings).toEqual({ 'cache-cleanup': expect.any(Number) })
  })
})
