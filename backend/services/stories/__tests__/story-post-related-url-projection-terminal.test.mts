import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import {
  assertRelationLimit,
  relationLimitsConfig,
} from '@services/entity-relations/relation-limits'
import { upsertSystemUser } from '@services/users/system-users'
import {
  createTestStoryProjectionLease,
  readStoryProjectionWorkForTest,
} from '../../../test-helpers/entities/story-projection-work.mts'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { runStoryProjectionSourceWithCapacityOutcome } from '../story-post-related-url-projection-terminal.mts'
import { releaseStoryPostRelatedUrlProjectionWork } from '../story-post-related-url-projection-work.mts'

describe('story projection terminal generation fencing', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  it('does not mark a new generation terminal after an old lease is refused capacity', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    const suffix = crypto.randomUUID()
    const [user, story, first, second] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Projection terminal fence ${suffix}` }),
      insertTestUrlDirect(null, `https://terminal-first-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://terminal-second-${suffix}.example.test/article`),
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
        try {
          await assertRelationLimit(relation, post.id, [first.id, second.id])
          throw new Error('Expected capacity refusal')
        } catch (err: unknown) {
          await refreshStoryPostForStory(story.id)
          throw err
        }
      })
      expect(result).toEqual({ processed: 0, continue: false })
      expect(await getPostRelatedUrlIds(post.id)).toEqual([])
      expect(await readStoryProjectionWorkForTest([post.id])).toMatchObject([
        { post_id: post.id, limit_reached_capacity: null, lease_token: null },
      ])
      const newer = await createTestStoryProjectionLease(post.id)
      if (!newer) throw new Error('Expected new-generation lease')
      try {
        expect(BigInt(newer.generation)).toBeGreaterThan(BigInt(work.generation))
      } finally {
        await releaseStoryPostRelatedUrlProjectionWork(newer)
      }
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(work)
    }
  })
})
