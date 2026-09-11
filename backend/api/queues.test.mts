import { describe, expect, it } from 'vitest'
import queues from './queues.mts'
import { policyManagedGlideQueueNames } from '@modules/worker-queue-inventory'

describe('API queue monitoring inventory', () => {
  it('contains every policy-managed GlideMQ queue exactly once', () => {
    const queueNames = queues.map(queue => queue.name)

    expect(queueNames.toSorted()).toEqual(policyManagedGlideQueueNames().toSorted())
    expect(new Set(queueNames).size).toBe(queueNames.length)
  })
})
