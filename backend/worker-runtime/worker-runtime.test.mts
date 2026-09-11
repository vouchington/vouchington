import { describe, expect, it, vi } from 'vitest'

import { loadWorkers, selectedWorkerDefinitions, type WorkerDefinition } from './worker-runtime.mts'

const DEFINITIONS: WorkerDefinition[] = [
  { queueName: 'emails', load: vi.fn<VitestLooseMock>(() => Promise.resolve({ name: 'emails' })) },
]

describe('Filaments worker-runtime adapter', () => {
  it('uses the topology-skew reporter by default', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      selectedWorkerDefinitions(DEFINITIONS, 'emails,queue-monitoring')

      expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(
        '[worker-runtime] dropping unknown QUEUES entries',
        ['queue-monitoring'],
      )
    } finally {
      consoleWarn.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('forwards an explicitly supplied topology-skew reporter', async () => {
    const onUnknownIncludes = vi.fn<(unknownQueueNames: readonly string[]) => void>()

    await loadWorkers(DEFINITIONS, 'emails,queue-monitoring', onUnknownIncludes)

    expect(onUnknownIncludes).toHaveBeenCalledExactlyOnceWith(['queue-monitoring'])
  })
})
