import { describe, expect, it } from 'vitest'
import { ACTIVITYPUB_PROCESS_DELIVERY_JOB } from '@queues/background/enqueues/activitypub-jobs'
import { activitypubHandlers } from './workers.mts'

describe('ActivityPub background handlers', () => {
  it('registers the signed inbox envelope processor in its dedicated inbound lane', () => {
    const handler = activitypubHandlers.find(
      candidate => candidate.job.name === ACTIVITYPUB_PROCESS_DELIVERY_JOB.name,
    )

    expect(handler).toBeDefined()
    expect(handler?.job.options.ordering).toMatchObject({ key: 'activitypub:inbound' })
    expect(handler?.job.options.removeOnComplete).toBe(true)
    expect(handler?.job.options.removeOnFail).toBe(true)
  })
})
