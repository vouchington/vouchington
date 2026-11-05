import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  getEntityRelation,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertSystemUser } from '@services/users/system-users'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { processOwnedStoryProjectionPage } from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'

describe('story post related URL projection ownership', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  it('refuses a projection batch that exceeds the related URL capacity', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    const suffix = crypto.randomUUID()
    const [user, story, first, second] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Projection capacity ${suffix}` }),
      insertTestUrlDirect(null, `https://story-first-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://story-second-${suffix}.example.test/article`),
    ])
    if (!user || !first || !second) throw new Error('Expected projection test fixtures')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: first.id, count: 1 })
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: second.id, count: 1 })
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await expect(drainProjection(post.id)).rejects.toMatchObject({
      status: 409,
      code: 'RELATION_LIMIT_REACHED',
    })
    expect(await getEntityRelation('relation__post__related__url', post.id, first.id)).toHaveLength(
      0,
    )
    expect(
      await getEntityRelation('relation__post__related__url', post.id, second.id),
    ).toHaveLength(0)
  })

  it('preserves an active related URL re-confirmed after generation capture', async () => {
    const suffix = crypto.randomUUID()
    const [user, story, sourceUrl, manualUrl] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Projection ownership ${suffix}` }),
      insertTestUrlDirect(null, `https://story-source-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://story-manual-${suffix}.example.test/article`),
    ])
    if (!user || !sourceUrl || !manualUrl) throw new Error('Expected projection test fixtures')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: sourceUrl.id, count: 2 })
    const prepared = await prepareStoryPost(story.id, user)
    const { post } = prepared.response
    await drainProjection(post.id)
    await refreshStoryPostForStory(story.id)
    const relatedUrl = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })
    await upsertEntityRelation(user, relatedUrl, { id: post.id }, [{ id: manualUrl.id }])
    await refreshStoryPostForStory(story.id)
    await drainProjection(post.id)

    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual(
      expect.arrayContaining([sourceUrl.id, manualUrl.id]),
    )
  })
})

async function drainProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await processOwnedStoryProjectionPage(postId)
    if (!result.continue) return
  }
  throw new Error(`Projection for ${postId} did not drain`)
}
