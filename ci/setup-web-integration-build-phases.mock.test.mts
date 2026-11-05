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

  it('starts both builders while held and waits for both before Next or copying assets', async () => {
    const fs = await import('node:fs')
    const { spawn } = await import('node:child_process')
    const held = new Map<string, MockChildProcess>()
    const started = Promise.withResolvers<void>()
    let releasing = false
    vi.mocked(spawn).mockImplementation((_command, args) => {
      const name = Array.isArray(args) ? args.join(' ') : ''
      const child = new EventEmitter() as unknown as MockChildProcess
      child.stderr = new EventEmitter()
      if (!releasing && (name === WORKER_COMMAND || name === STORYBOOK_COMMAND)) {
        held.set(name, child)
        started.resolve()
      } else queueMicrotask(() => child.emit('close', 0))
      return child as unknown as ReturnType<typeof spawn>
    })
    const modulePath = './setup-web-integration.mts?held-builders'
    const loading = import(modulePath)
    const outcome = loading.then(
      () => undefined,
      (err: unknown) => err,
    )
    try {
      await started.promise
      expect(held.size).toBe(2)
      expect(spawn).toHaveBeenCalledTimes(2)
      expect(fs.cpSync).not.toHaveBeenCalled()
      held.get(STORYBOOK_COMMAND)!.emit('close', 0)
      await Promise.resolve()
      expect(spawn).toHaveBeenCalledTimes(2)
      expect(fs.cpSync).not.toHaveBeenCalled()
      held.get(WORKER_COMMAND)!.emit('close', 0)
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
    'settles both builders and preserves error precedence with worker exit %i',
    async workerExit => {
      const fs = await import('node:fs')
      const { spawn } = await import('node:child_process')
      const held = new Map<string, MockChildProcess>()
      const started = Promise.withResolvers<void>()
      const timingPath = '/tmp/setup-web-timings-dual-failure.json'
      vi.stubEnv('VOUCHINGTON_SETUP_WEB_TIMINGS_JSON', timingPath)
      let releasing = false
      vi.mocked(spawn).mockImplementation((_command, args) => {
        const name = Array.isArray(args) ? args.join(' ') : ''
        const child = new EventEmitter() as unknown as MockChildProcess
        child.stderr = new EventEmitter()
        if (!releasing) {
          held.set(name, child)
          started.resolve()
        } else queueMicrotask(() => child.emit('close', 0))
        return child as unknown as ReturnType<typeof spawn>
      })
      const modulePath = './setup-web-integration.mts?dual-build-failure'
      const loading = import(modulePath)
      const outcome = loading.then(
        () => undefined,
        (err: unknown) => err,
      )
      try {
        await started.promise
        expect(held.size).toBe(2)
        held.get(STORYBOOK_COMMAND)!.emit('close', 9)
        held.get(WORKER_COMMAND)!.emit('close', workerExit)
        expect(await outcome).toMatchObject({
          message:
            workerExit === 7
              ? `pnpm ${WORKER_COMMAND} failed with exit code 7`
              : `pnpm ${STORYBOOK_COMMAND} failed with exit code 9`,
        })
        expect(spawn).toHaveBeenCalledTimes(2)
        expect(fs.cpSync).not.toHaveBeenCalled()
        const reports = vi
          .mocked(fs.writeFileSync)
          .mock.calls.filter(([path]) => path === timingPath)
          .map(
            ([, json]) =>
              JSON.parse(stringFromUnknown(json)) as { timings: Record<string, number> },
          )
        expect(reports.at(-1)?.timings).toEqual(
          expect.objectContaining({
            'cache-cleanup': expect.any(Number),
            'cloudflare-worker-build': expect.any(Number),
            'storybook-build': expect.any(Number),
          }),
        )
      } finally {
        releasing = true
        for (const child of held.values()) child.emit('close', 0)
        await outcome
      }
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
    const modulePath = './setup-web-integration.mts?cleanup-failure'
    await expect(import(modulePath)).rejects.toBe(failure)
    expect(spawn).not.toHaveBeenCalled()
    const reports = vi
      .mocked(fs.writeFileSync)
      .mock.calls.filter(([path]) => path === timingPath)
      .map(([, json]) => JSON.parse(stringFromUnknown(json)) as { timings: Record<string, number> })
    expect(reports.at(-1)?.timings).toEqual({ 'cache-cleanup': expect.any(Number) })
  })
})
