import { describe, expect, it } from 'vitest'
import {
  countFollowerDistributionsForSenderForTest,
  createTestPost,
  createTestUser,
  followUser,
} from '@voucha/test-helpers'
import { runConcurrentFollowerDistributionsForTest } from '@voucha/test-helpers/follower-distribution-concurrency'
import { sendPostToFollowers } from './create.mts'

describe('concurrent follower distributions', () => {
  it('commits one distribution and returns 409 when two sends read the same empty daily window', async () => {
    const sender = await createTestUser()
    const follower = await createTestUser()
    const post = await createTestPost({ user: follower, privacy: 'public' })
    await followUser(follower, sender)

    const outcomes = await runConcurrentFollowerDistributionsForTest(() =>
      sendPostToFollowers(sender, post.id, {
        audience: 'selected_followers',
        recipient_user_ids: [follower.id],
      }),
    )

    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    const failures = outcomes.filter(outcome => outcome.status === 'rejected')
    expect(failures).toHaveLength(1)
    expect(failures[0]!.reason).toMatchObject({ statusCode: 409, cause: { code: '40001' } })
    await expect(countFollowerDistributionsForSenderForTest(sender.id)).resolves.toBe(1)
  })
})
