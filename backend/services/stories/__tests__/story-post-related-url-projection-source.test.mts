import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  deleteTestStoryPostProjectionJob,
  getTestStoryPostProjectionReceiptCount,
  insertTestPost,
  insertTestPostStory,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { createTestStoryMembers } from '@voucha/test-helpers/entities/story-member-pages'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import {
  decideStoryPostRelatedUrlProjectionRows,
  getStoryPostRelatedUrlProjectionSourcePageForWork,
} from '../story-post-related-url-projection-source.mts'
import {
  claimStoryPostRelatedUrlProjectionWork,
  markStoryPostRelatedUrlProjection,
  releaseStoryPostRelatedUrlProjectionWork,
} from '../story-post-related-url-projection-work.mts'

describe('story projection source eligibility database failure', () => {
  it('rethrows a hostname-check failure instead of deciding the source is unsafe', async () => {
    const user = await createTestUser()
    const url = await insertTestUrlDirect(
      null,
      `https://projection-${randomUUID()}.example.test/item`,
    )
    if (!url) throw new Error('Expected the owned public projection URL')
    const { story } = await createTestStoryMembers(1, { urlId: url.id })
    const postId = await insertTestPost({
      createdById: user.id,
      postType: 'story',
      title: 'Projection source failure',
      slug: `projection-source-${randomUUID()}`,
      markdown: '',
    })
    await insertTestPostStory(postId, story.id, user.id)
    {
      await using transaction = await beginTransaction()
      await markStoryPostRelatedUrlProjection(transaction, postId, story.id)
      await transaction.commit()
    }
    const work = await claimStoryPostRelatedUrlProjectionWork(postId)
    if (!work) throw new Error('Expected owned projection work')
    try {
      const rows = await getStoryPostRelatedUrlProjectionSourcePageForWork(work)
      expect(rows).toHaveLength(1)
      const { result, error } = await withPostgresPoolQueryFailureForTest(
        '/* assertUrlsHaveNoBlockedHostnames */',
        () => decideStoryPostRelatedUrlProjectionRows(work, rows).catch((err: unknown) => err),
      )

      expect(result).toBe(error)
      expect(await getTestStoryPostProjectionReceiptCount(postId)).toBe(0)
      await expect(decideStoryPostRelatedUrlProjectionRows(work, rows)).resolves.toEqual([
        { ...rows[0], is_eligible: true },
      ])
      expect(await getTestStoryPostProjectionReceiptCount(postId)).toBe(0)
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(work)
      await deleteTestStoryPostProjectionJob(postId)
    }
  })
})
