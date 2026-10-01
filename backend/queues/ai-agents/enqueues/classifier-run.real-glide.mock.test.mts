import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ai_agents } from '../queues.mts'
import {
  classifierRunJobExists,
  classifierRunJobId,
  enqueueBulkClassifierRuns,
} from './classifier-run.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

function runJobData() {
  return {
    classifier: 'post-classifier',
    runId: randomUUID(),
    postId: randomUUID(),
    rssFeedItemId: null,
    inputSha256: Buffer.alloc(32, 1).toString('hex'),
    configurationSha256: Buffer.alloc(32, 2).toString('hex'),
  }
}

describe('classifier run bulk enqueue (real GlideMQ)', () => {
  const runIds: string[] = []

  afterEach(async () => {
    await Promise.all(
      runIds.splice(0).map(async runId => {
        await (await ai_agents.getJob(classifierRunJobId(runId)))?.remove()
      }),
    )
  })

  it('reports only the jobs it adds and skips a run whose stable-id job still exists', async () => {
    const first = runJobData()
    const second = runJobData()
    runIds.push(first.runId, second.runId)
    await expect(classifierRunJobExists(first.runId)).resolves.toBe(false)

    await expect(enqueueBulkClassifierRuns([first])).resolves.toEqual([first.runId])

    await expect(classifierRunJobExists(first.runId)).resolves.toBe(true)
    await expect(enqueueBulkClassifierRuns([first, second])).resolves.toEqual([second.runId])
    await expect(enqueueBulkClassifierRuns([first, second])).resolves.toEqual([])
  })

  it('releases the stable identity when the job is removed, so the sweep may add it again', async () => {
    const data = runJobData()
    runIds.push(data.runId)
    await enqueueBulkClassifierRuns([data])

    await (await ai_agents.getJob(classifierRunJobId(data.runId)))?.remove()

    await expect(classifierRunJobExists(data.runId)).resolves.toBe(false)
    await expect(enqueueBulkClassifierRuns([data])).resolves.toEqual([data.runId])
  })
})
