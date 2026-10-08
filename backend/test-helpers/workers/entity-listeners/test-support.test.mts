import { describe, expect, it } from 'vitest'
import { QUEUE_NAME } from '@queues/entity-listeners/config'
import { entitiesListeners } from '@workers/entity-listeners/workers'
import { getOrCreateQueue } from '../../../../test-helpers/glide-mq-vitest-internals.mts'
import { onceEntityListenerCompleted } from '@voucha/test-helpers/workers/entity-listeners/test-support'

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

  it('does not treat a drained worker as the job this call is waiting for', async () => {
    const entityId = crypto.randomUUID()
    expect(entitiesListeners.isDrained).toBe(true)
    await expect(
      onceEntityListenerCompleted('processPostCreated', entityId, 1, 200),
    ).rejects.toThrow('timed out after 200ms')
  })
})
