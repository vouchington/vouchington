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

const captureMessage = sentryMocks.captureMessage

import { recordWorkerQueueTopologySkew } from './worker-queue-topology-skew.mts'

describe('recordWorkerQueueTopologySkew', () => {
  beforeEach(() => {
    captureMessage.mockClear()
  })

  it('captures a warning-level Sentry message naming the dropped queues', () => {
    recordWorkerQueueTopologySkew(['queue-monitoring'])

    expect(captureMessage).toHaveBeenCalledOnce()
    expect(captureMessage).toHaveBeenCalledWith('worker_queue_topology_skew', {
      level: 'warning',
      tags: { reason: 'worker_queue_topology_skew' },
      extra: { unknownQueueNames: ['queue-monitoring'] },
    })
  })

  it('reports every dropped queue name in one message', () => {
    recordWorkerQueueTopologySkew(['queue-monitoring', 'another-new-queue'])

    expect(captureMessage).toHaveBeenCalledWith('worker_queue_topology_skew', {
      level: 'warning',
      tags: { reason: 'worker_queue_topology_skew' },
      extra: { unknownQueueNames: ['queue-monitoring', 'another-new-queue'] },
    })
  })

  it('does nothing when there are no unknown queue names', () => {
    recordWorkerQueueTopologySkew([])

    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('emits console.warn in development mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      recordWorkerQueueTopologySkew(['queue-monitoring'])
      expect(consoleWarn).toHaveBeenCalledWith('[worker-runtime] dropping unknown QUEUES entries', [
        'queue-monitoring',
      ])
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
