import { describe, expect, it } from 'vitest'
import { BACKGROUND_CPU_JOBS } from '@queues/background-cpu/enqueues/registry'
import { buildCpuHandlerMap } from './handler-map.mts'
import { BACKGROUND_CPU_HANDLERS, resolveCpuJobRoute } from './handlers.mts'

describe('background-cpu production handler coverage', () => {
  it('routes every registered moved job to a production processor', () => {
    const map = buildCpuHandlerMap(BACKGROUND_CPU_HANDLERS)
    expect([...map.keys()].toSorted()).toEqual(BACKGROUND_CPU_JOBS.map(job => job.name).toSorted())
    for (const job of BACKGROUND_CPU_JOBS) {
      expect(resolveCpuJobRoute(job.name)).toBeTruthy()
    }
    expect(resolveCpuJobRoute('crawl.unknown_job')).toBeUndefined()
    expect(resolveCpuJobRoute('bedrock-embeddings.unknown_job')).toBeUndefined()
  })
})
