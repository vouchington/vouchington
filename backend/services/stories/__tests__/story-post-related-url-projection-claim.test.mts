import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  deleteTestPost,
  deleteTestStory,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { deleteTestStoryPostProjectionJob } from '@voucha/test-helpers/entities/story-post-related-url-projections'
import { readStoryProjectionWorkForTest } from '@voucha/test-helpers/entities/story-projection-work'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { upsertSystemUser } from '@services/users/system-users'
import { hasClaimableStoryPostRelatedUrlProjectionWork } from '../story-post-related-url-projection-claim.mts'
import { prepareStoryPost } from '../story-posts.mts'

describe('story projection scheduler availability', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  it('reports work available for an unleased generation created by story preparation', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    const suffix = crypto.randomUUID()
    const [user, story, url] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Scheduler availability ${suffix}` }),
      insertTestUrlDirect(null, `https://scheduler-availability-${suffix}.example.test/article`),
    ])
    if (!url) throw new Error('Expected a story source URL')
    onTestFinished(() => deleteTestStory(story.id))
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: url.id, count: 2 })
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    onTestFinished(async () => {
      await deleteTestStoryPostProjectionJob(post.id)
      await deleteTestPost(post.id)
    })
    expect(await readStoryProjectionWorkForTest([post.id])).toEqual([
      { post_id: post.id, lease_token: null },
    ])
    await expect(hasClaimableStoryPostRelatedUrlProjectionWork()).resolves.toBe(true)
  })
})
