import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost, safeUsername } from '@voucha/test-helpers'
import { withConcurrentPostModerationVersionCommitForTest } from '@voucha/test-helpers/post-moderation-version-race'
import { ensureCurrentPostModerationVersion } from './moderation-ledger.mts'

describe('ensureCurrentPostModerationVersion concurrency', () => {
  let userId: string

  beforeAll(async () => {
    userId = (await createTestUser({ username: safeUsername('ledger-concurrent') })).id
  })

  it('returns the version a concurrent writer commits while it waits for the post lock', async () => {
    const postId = await insertTestPost({
      title: `ledger-concurrent-${crypto.randomUUID()}`,
      slug: `ledger-concurrent-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })

    const { result, committed } = await withConcurrentPostModerationVersionCommitForTest(
      postId,
      () => ensureCurrentPostModerationVersion(postId),
    )

    expect(result.id).toBe(committed.id)
  })
})
