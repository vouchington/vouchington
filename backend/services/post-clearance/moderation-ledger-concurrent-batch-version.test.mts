import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost, safeUsername } from '@voucha/test-helpers'
import { withConcurrentPostModerationVersionCommitForTest } from '@voucha/test-helpers/post-moderation-version-race'
import { commitCurrentPostModerationVersions } from './moderation-ledger.mts'

describe('commitCurrentPostModerationVersions concurrency', () => {
  let userId: string

  beforeAll(async () => {
    userId = (await createTestUser({ username: safeUsername('ledger-batch-concurrent') })).id
  })

  async function insertPost() {
    return insertTestPost({
      title: `ledger-batch-${crypto.randomUUID()}`,
      slug: `ledger-batch-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })
  }

  it('returns versions a concurrent writer commits while the batch waits for a post lock', async () => {
    const racedPostId = await insertPost()
    const plainPostId = await insertPost()

    const { result, committed } = await withConcurrentPostModerationVersionCommitForTest(
      racedPostId,
      () => commitCurrentPostModerationVersions([racedPostId, plainPostId]),
      'commitCurrentPostModerationVersions',
    )

    expect(result.map(version => version.post_id).toSorted()).toEqual(
      [racedPostId, plainPostId].toSorted(),
    )
    expect(result.find(version => version.post_id === racedPostId)?.id).toBe(committed.id)
  })
})
