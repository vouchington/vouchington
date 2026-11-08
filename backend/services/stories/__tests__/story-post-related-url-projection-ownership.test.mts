import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  assertRelationLimit,
  relationLimitsConfig,
} from '@services/entity-relations/relation-limits'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertSystemUser } from '@services/users/system-users'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { readStoryProjectionWorkForTest } from '../../../test-helpers/entities/story-projection-work.mts'
import { processOwnedStoryProjectionPage } from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'

describe('story post related URL projection ownership', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  it('admits the oldest source URL when the story exceeds the related URL cap', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    const suffix = crypto.randomUUID()
    const [user, story, first, second, extra] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Projection capacity ${suffix}` }),
      insertTestUrlDirect(null, `https://story-first-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://story-second-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://story-extra-${suffix}.example.test/article`),
    ])
    if (!user || !first || !second || !extra) throw new Error('Expected projection test fixtures')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: first.id, count: 1 })
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: second.id, count: 1 })
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await drainProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([first.id])
    expect(await readStoryProjectionWorkForTest([post.id])).toEqual([])
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })
    await expect(
      assertRelationLimit(relation, post.id, [second.id, extra.id]),
    ).rejects.toMatchObject({ code: 'RELATION_LIMIT_REACHED' })
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
