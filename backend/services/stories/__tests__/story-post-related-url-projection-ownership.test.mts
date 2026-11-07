import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  assertRelationLimit,
  relationLimitsConfig,
} from '@services/entity-relations/relation-limits'
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
import {
  createTestStoryProjectionLease,
  readStoryProjectionWorkForTest,
} from '../../../test-helpers/entities/story-projection-work.mts'
import { runStoryProjectionSourceWithCapacityOutcome } from '../story-post-related-url-projection-terminal.mts'
import { releaseStoryPostRelatedUrlProjectionWork } from '../story-post-related-url-projection-work.mts'
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
    await expect(drainProjection(post.id)).resolves.toBeUndefined()
    expect(await readStoryProjectionWorkForTest([post.id])).toMatchObject([
      { post_id: post.id, limit_reached_capacity: 1, lease_token: null },
    ])
    await expect(processOwnedStoryProjectionPage(post.id)).resolves.toEqual({
      processed: 0,
      continue: false,
    })
    expect(await getEntityRelation('relation__post__related__url', post.id, first.id)).toHaveLength(
      0,
    )
    expect(
      await getEntityRelation('relation__post__related__url', post.id, second.id),
    ).toHaveLength(0)
    await refreshStoryPostForStory(story.id)
    expect(await readStoryProjectionWorkForTest([post.id])).toMatchObject([
      { post_id: post.id, limit_reached_capacity: null },
    ])
    await drainProjection(post.id)
    expect(await readStoryProjectionWorkForTest([post.id])).toMatchObject([
      { post_id: post.id, limit_reached_capacity: 1 },
    ])
    const restoreCap = overrideDynamicConfigFieldsForTest(relationLimitsConfig, {
      post_related_url: 2,
    })
    try {
      await drainProjection(post.id)
      expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(
        [first.id, second.id].toSorted(),
      )
      expect(await readStoryProjectionWorkForTest([post.id])).toEqual([])
    } finally {
      restoreCap()
    }
  })

  it('restarts when the guard rejects at an intermediate capacity', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 2 }),
    )
    const suffix = crypto.randomUUID()
    const [user, story, first, second] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Projection capacity change ${suffix}` }),
      insertTestUrlDirect(null, `https://capacity-first-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://capacity-second-${suffix}.example.test/article`),
    ])
    if (!first || !second) throw new Error('Expected URL fixtures')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: first.id, count: 2 })
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    const work = await createTestStoryProjectionLease(post.id)
    if (!work) throw new Error('Expected projection lease')
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })
    try {
      const result = await runStoryProjectionSourceWithCapacityOutcome(work, async () => {
        const restore = overrideDynamicConfigFieldsForTest(relationLimitsConfig, {
          post_related_url: 1,
        })
        try {
          await assertRelationLimit(relation, post.id, [first.id, second.id])
          throw new Error('Expected the lower-capacity guard to reject')
        } finally {
          restore()
        }
      })
      expect(result).toMatchObject({ processed: 0, continue: true })
      const restarted = await createTestStoryProjectionLease(post.id)
      if (!restarted) throw new Error('Expected restarted projection lease')
      try {
        expect(BigInt(restarted.generation)).toBeGreaterThan(BigInt(work.generation))
        expect(restarted.limit_reached_capacity).toBeNull()
      } finally {
        await releaseStoryPostRelatedUrlProjectionWork(restarted)
      }
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(work)
    }
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
