import { describe, expect, it } from 'vitest'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'
import { WORKER_DEFINITIONS as IO_WORKER_DEFINITIONS } from '@entrypoints/worker-io/worker-definitions'
import { workerQueuePolicy } from '@backend/worker-runtime'

const cpuOnlyDefinitions = WORKER_DEFINITIONS.filter(definition =>
  workerQueuePolicy.cpuOnlyQueues.includes(definition.queueName),
)

function expectLazyImport(loadSource: string, runtimePath: string, exportName: string) {
  const pathMatch = runtimePath.match(/\/backend\/workers\/(?<directory>[^/]+)\/(?<file>[^/.]+)/)

  expect(pathMatch?.groups).toBeDefined()
  expect(loadSource).toContain(pathMatch!.groups!.directory)
  expect(loadSource).toContain(pathMatch!.groups!.file)
  expect(loadSource).toMatch(new RegExp(`\\b${exportName}\\b`))
}

describe('worker-cpu worker definitions', () => {
  it('combines CPU-only and IO-capable definitions for the merged worker entrypoint', () => {
    expect(WORKER_DEFINITIONS).toEqual([...cpuOnlyDefinitions, ...IO_WORKER_DEFINITIONS])
  })

  it('each worker definition points at the expected lazy import export', () => {
    const expectedDefinitions = [
      ['background-cpu', '/backend/workers/background-cpu/workers.mts', 'backgroundCpu'],
      ['crawl_browser', '/backend/workers/crawl-browser/workers.mts', 'crawlBrowser'],
      ['image-uploads', '/backend/workers/image-uploads/workers.mts', 'imageUploads'],
      ['ai_agents', '/backend/workers/ai-agents/workers.mts', 'ai_agents'],
    ] as const
    const byQueue = (name: string) =>
      cpuOnlyDefinitions.find(definition => definition.queueName === name)!

    expect(cpuOnlyDefinitions.map(definition => definition.queueName)).toEqual(
      expectedDefinitions.map(([queueName]) => queueName),
    )
    for (const [queueName, runtimePath, exportName] of expectedDefinitions) {
      const loadSource = byQueue(queueName).load.toString()
      expectLazyImport(loadSource, runtimePath, exportName)
    }
  })
})
