import { describe, expect, it } from 'vitest'
import { QUEUE_NAME } from '@queues/entity-listeners/config'
import { getOrCreateQueue } from '../../../test-helpers/glide-mq-vitest-internals.mts'
import { onceEntityListenerCompleted } from './test-support.mts'

describe('onceEntityListenerCompleted', () => {
  it('resolves when the matching job already completed before the listener registered', async () => {
    const entityId = crypto.randomUUID()
    const queue = getOrCreateQueue(QUEUE_NAME)
    const job = await queue.add('processPostCreated', { id: entityId })
    const record = queue.jobs.get(job!.id)
    expect(record).toBeDefined()
    record!.state = 'completed'

    await expect(
      onceEntityListenerCompleted('processPostCreated', entityId, 1, 500),
    ).resolves.toBeUndefined()
  })
})
