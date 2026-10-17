import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createTestUserDeletionRequestWithoutWaiting,
  holdTestRetainedUserIdentityLocks,
  lockTestRetainedUserIdentityKeyShareNowait,
} from '@voucha/test-helpers/entities/user-deletion-actor-locks'
import { countUserDeletionRequestsForTest } from '@voucha/test-helpers/entities/user-deletion-request-counts'
import { TestUserDeletionWriterAborted } from '@voucha/test-helpers/entities/user-deletion'

describe('reciprocal deletion lock producers', () => {
  it('fails a key-share probe with lock_not_available while the holder is open', async () => {
    const user = await createTestUser({ administrator: true })
    const gate = await holdTestRetainedUserIdentityLocks([user.id])
    const aborted = gate.completed.then(
      () => {
        throw new Error('Expected the retained-identity lock to abort before cleanup')
      },
      (err: unknown) => {
        if (!(err instanceof TestUserDeletionWriterAborted)) throw err
      },
    )
    try {
      await expect(lockTestRetainedUserIdentityKeyShareNowait(user.id)).rejects.toMatchObject({
        code: '55P03',
      })
    } finally {
      gate.abort()
      await aborted
    }
  })

  it('fails the deletion-request producer with lock_not_available and writes no request', async () => {
    const [target, actor] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ administrator: true }),
    ])
    const gate = await holdTestRetainedUserIdentityLocks([target.id, actor.id])
    const aborted = gate.completed.then(
      () => {
        throw new Error('Expected the retained-identity lock to abort before cleanup')
      },
      (err: unknown) => {
        if (!(err instanceof TestUserDeletionWriterAborted)) throw err
      },
    )
    try {
      await expect(
        createTestUserDeletionRequestWithoutWaiting(target.id, actor.id),
      ).rejects.toMatchObject({ code: '55P03' })
      await expect(countUserDeletionRequestsForTest(target.id)).resolves.toBe(0)
    } finally {
      gate.abort()
      await aborted
    }
  })
})
