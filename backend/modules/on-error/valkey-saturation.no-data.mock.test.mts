import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mirrors vitest.setup.sentry-mock.mts; kept local so this .mock test owns its vi.mock().
const sentryMocks = vi.hoisted(() => {
  const key = 'vouchaSentryMocks'
  const globalMocks = globalThis as typeof globalThis & {
    [key]?: {
      init: ReturnType<typeof vi.fn<VitestLooseMock>>
      captureException: ReturnType<typeof vi.fn<VitestLooseMock>>
      captureMessage: ReturnType<typeof vi.fn<VitestLooseMock>>
      flush: ReturnType<typeof vi.fn<VitestLooseMock>>
      addBreadcrumb: ReturnType<typeof vi.fn<VitestLooseMock>>
    }
  }
  const mocks = globalMocks[key] ?? {
    init: vi.fn<VitestLooseMock>(),
    captureException: vi.fn<VitestLooseMock>(),
    captureMessage: vi.fn<VitestLooseMock>(),
    flush: vi.fn<VitestLooseMock>(() => Promise.resolve(true)),
    addBreadcrumb: vi.fn<VitestLooseMock>(),
  }
  globalMocks[key] = mocks
  mocks.captureMessage ??= vi.fn<VitestLooseMock>()
  return mocks
})

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), () => ({
  ...sentryMocks,
  default: sentryMocks,
}))

const { writeSyncMock } = vi.hoisted(() => ({
  writeSyncMock: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, writeSync: writeSyncMock }
})

// #8940: recordValkeySaturation() also mirrors a bounded sample of saturation events to fd 2 under
// NODE_ENV=test, so a saturation storm can be pinned to the pid of the fork that produced it —
// correlated against that same pid's [vitest-fork-exit] line at read time. This suite covers only
// that sentinel; the console/Sentry behavior it wraps is covered by
// ../data-stores/valkey-glide-mq/__tests__/glide-mq-retry.no-data.mock.test.mts.
describe('recordValkeySaturation — fd-2 sentinel (#8940)', () => {
  beforeEach(() => {
    vi.resetModules()
    writeSyncMock.mockClear()
  })

  it('emits one sentinel line to fd 2 for the first event', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const { recordValkeySaturation } = await import('./valkey-saturation.mts')
      recordValkeySaturation({ client: 'worker-queue-command', command: 'xadd', attempt: 1 })

      expect(writeSyncMock).toHaveBeenCalledOnce()
      const [fd, line] = writeSyncMock.mock.calls[0] as [number, string]
      expect(fd).toBe(2)
      expect(line).toMatch(
        /^\[valkey-saturation\] pid=\d+ client=worker-queue-command command=xadd attempt=1 count=1\n$/,
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('samples the first 5 events, then goes silent until the next periodic tick', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const { recordValkeySaturation } = await import('./valkey-saturation.mts')
      for (let i = 0; i < 6; i++) {
        recordValkeySaturation({ client: 'worker-queue-command', command: 'xadd', attempt: 1 })
      }

      expect(writeSyncMock).toHaveBeenCalledTimes(5)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('resumes emitting every 50th event after the initial sample', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const { recordValkeySaturation } = await import('./valkey-saturation.mts')
      for (let i = 0; i < 50; i++) {
        recordValkeySaturation({ client: 'worker-queue-command', command: 'xadd', attempt: 1 })
      }

      // 5 from the initial sample, plus the 50th event.
      expect(writeSyncMock).toHaveBeenCalledTimes(6)
      const lastLine = writeSyncMock.mock.calls.at(-1)?.[1] as string
      expect(lastLine).toContain('count=50')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('never carries forbidden classifier vocabulary (#8940 vocabulary constraint)', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    try {
      const { recordValkeySaturation } = await import('./valkey-saturation.mts')
      recordValkeySaturation({ client: 'worker-queue-command', command: 'xadd', attempt: 1 })

      const line = writeSyncMock.mock.calls[0]?.[1] as string
      expect(line).not.toMatch(/ FAIL |AssertionError|Test timed out|Error: Test timed out/)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('stays silent outside NODE_ENV=test', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const { recordValkeySaturation } = await import('./valkey-saturation.mts')
      recordValkeySaturation({ client: 'worker-queue-command', command: 'xadd', attempt: 1 })

      expect(writeSyncMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
