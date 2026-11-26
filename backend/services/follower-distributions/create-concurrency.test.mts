import { describe, expect, it } from 'vitest'
import {
  countFollowerDistributionsForSenderForTest,
  createTestPost,
  createTestUser,
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { holdTestUserRowLock } from '@voucha/test-helpers/user-row-lock'
import { sharePostWithFollowers } from './create.mts'

describe('concurrent follower distributions', () => {
  it('commits shares from two different senders for the same post', async () => {
    const firstSender = await createTestUser()
    const secondSender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })
    await using holder = await holdTestUserRowLock(firstSender.id)

    await withTestOwnedPostgresWait(
      {
        holderProcessId: holder.processId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'createDistribution',
        releaseHolder: holder.release,
      },
      async waitForLock => {
        const first = sharePostWithFollowers(firstSender, post.id)
        await waitForLock(first)
        const second = await sharePostWithFollowers(secondSender, post.id)
        await holder.release()
        expect(await first).toMatchObject({ status: 'accepted' })
        expect(second).toMatchObject({ status: 'accepted' })
      },
    )

    expect(await countFollowerDistributionsForSenderForTest(firstSender.id)).toBe(1)
    expect(await countFollowerDistributionsForSenderForTest(secondSender.id)).toBe(1)
  })
})
