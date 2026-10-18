import type { Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { createTestUser, readEnqueuedJob } from '@voucha/test-helpers'
import { background } from '@queues/background/queues'
import { enqueueOnUserCreated, enqueueOnUserLoggedIn } from '@queues/entity-listeners/enqueues'
import { entityListenersHandlers } from '../workers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('user entity listener payloads through real GlideMQ', () => {
  it.each([
    ['created', enqueueOnUserCreated, 'entity-listeners.processUserCreated'],
    ['logged in', enqueueOnUserLoggedIn, 'entity-listeners.processUserLoggedIn'],
  ] as const)('enqueues and processes a %s user with only its id', async (_, enqueue, name) => {
    const user = await createTestUser()
    const queued = await readEnqueuedJob(background, await enqueue(user.id))

    expect(queued.data).toEqual({ id: user.id })
    const handler = entityListenersHandlers.find(candidate => candidate.job.name === name)
    if (!handler) throw new Error(`Missing entity listener handler: ${name}`)
    await handler.handle(queued as Job)
  })
})
