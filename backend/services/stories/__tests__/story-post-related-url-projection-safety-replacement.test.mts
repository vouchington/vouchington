import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { storiesWorkConfig } from '@services/stories/work-limits'
import { upsertSystemUser } from '@services/users/system-users'
import { createTestStoryProjectionLease } from '../../../test-helpers/entities/story-projection-work.mts'
import {
  drainStoryPostRelatedUrlProjection,
  processOwnedStoryProjectionPage,
} from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { writeStoryPostRelatedUrlProjectionRelations } from '../story-post-related-url-projection-relations.mts'
import {
  decideStoryPostRelatedUrlProjectionRows,
  getStoryPostRelatedUrlProjectionSourcePageForWork,
  stageStoryPostRelatedUrlProjectionReceipts,
} from '../story-post-related-url-projection-source.mts'
import { releaseStoryPostRelatedUrlProjectionWork } from '../story-post-related-url-projection-work.mts'

describe('story projection safety change at capacity', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  it('replaces an existing source blocked after eligibility staging without exceeding capacity', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 2 }),
    )
    await storiesWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(storiesWorkConfig, {
        post_related_url_projection_page_size: 3,
      }),
    )
    const suffix = crypto.randomUUID()
    const [user, story, blocked, retained, replacement] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Projection safety replacement ${suffix}` }),
      insertTestUrlDirect(null, `https://safety-blocked-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://safety-retained-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://safety-replacement-${suffix}.example.test/article`),
    ])
    if (!blocked || !retained || !replacement) throw new Error('Expected URL fixtures')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: blocked.id, count: 1 })
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: retained.id, count: 1 })
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await drainStoryPostRelatedUrlProjection(post.id)
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: replacement.id, count: 1 })
    await refreshStoryPostForStory(story.id)
    await expect(processOwnedStoryProjectionPage(post.id)).resolves.toMatchObject({
      processed: 3,
      continue: true,
    })
    await expect(processOwnedStoryProjectionPage(post.id)).resolves.toMatchObject({
      processed: 0,
      continue: true,
    })
    const work = await createTestStoryProjectionLease(post.id)
    if (!work) throw new Error('Expected source-writing lease')
    try {
      const rows = await getStoryPostRelatedUrlProjectionSourcePageForWork(work)
      const decisions = await decideStoryPostRelatedUrlProjectionRows(work, rows)
      expect(decisions).toHaveLength(3)
      expect(decisions.every(row => row.is_eligible)).toBe(true)
      await expect(stageStoryPostRelatedUrlProjectionReceipts(work, decisions)).resolves.toBe(true)
      await updateUrlHostnameBlocked(blocked.hostname.id, true)
      await expect(writeStoryPostRelatedUrlProjectionRelations(work, decisions)).resolves.toBe(true)
      expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(
        [retained.id, replacement.id].toSorted(),
      )
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(work)
    }
    await drainStoryPostRelatedUrlProjection(post.id)
  })
})
