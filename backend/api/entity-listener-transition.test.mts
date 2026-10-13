import { describe, expect, it } from 'vitest'
import { enqueueOnUserUpdated } from '../queues/entity-listeners/enqueues/users.mts'
import { entitiesListeners } from '../queues/entity-listeners/queues.mts'
import { createTestUserDirect } from '../test-helpers/entities/users-direct.mts'
import { withTestEntityListenerCompletion } from '../test-helpers/entity-listener-transition.mts'
import { readEnqueuedJob } from '../test-helpers/queue-jobs.mts'

describe('owned entity-listener logical admission', () => {
  it('joins a successful real job after a supported pre-admission saturation retry', async () => {
    const user = await createTestUserDirect()
    let attempts = 0
    const job = await withTestEntityListenerCompletion(
      'processUserUpdated',
      user.id,
      () => enqueueOnUserUpdated(user.id),
      {
        beforeAdd: async () => {
          attempts++
          if (attempts === 1) throw new Error('Reached maximum inflight requests')
        },
        release: () => {},
      },
    )
    expect(attempts).toBe(2)
    const persisted = await readEnqueuedJob(entitiesListeners, job)
    expect(persisted).toMatchObject({ name: 'processUserUpdated', data: { id: user.id } })
    expect(await persisted.getState()).toBe('completed')
  })

  it('preserves a non-retryable admission failure without claiming a successful job', async () => {
    const user = await createTestUserDirect()
    const failure = new Error('Ambiguous command timeout')
    let attempts = 0
    const operation = withTestEntityListenerCompletion(
      'processUserUpdated',
      user.id,
      () => enqueueOnUserUpdated(user.id),
      {
        beforeAdd: async () => {
          attempts++
          throw failure
        },
        release: () => {},
      },
    )
    await expect(operation).rejects.toBe(failure)
    expect(attempts).toBe(1)
  })
})
