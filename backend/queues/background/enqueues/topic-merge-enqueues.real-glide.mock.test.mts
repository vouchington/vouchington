import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { background } from '../queues.mts'
import { enqueueRecoveredTopicMergePages, enqueueTopicMergePage } from './topic-merge-enqueues.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('topic merge page admission', () => {
  it('uses the operation and generation for direct and recovered page ids', async () => {
    const operationId = randomUUID()
    const jobId = `topic_merge_page_${operationId}_3`
    onTestFinished(async () => {
      await (await background.getJob(jobId))?.remove()
    })

    const direct = await enqueueTopicMergePage(operationId, 3)
    expect(direct?.id).toBe(jobId)
    expect(direct?.data).toEqual({ operationId, generation: 3 })
    await direct?.remove()

    const [recovered] = await enqueueRecoveredTopicMergePages([{ operationId, generation: 3 }])
    expect(recovered?.id).toBe(jobId)
    expect(recovered?.data).toEqual({ operationId, generation: 3 })
  })
})
