import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  createReferralProgramFixture,
  createTestUserDirect,
  getEntityRelation,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrl,
  insertTestUrlDirect,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { upsertSystemUser } from '@services/users/system-users'
import { drainStoryPostRelatedUrlProjection } from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'
import { prepareStoryPost } from '../story-posts.mts'

describe('story projection capacity', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  it('does not refill past a referral URL that occupies the prefix', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    const user = await createTestUserDirect()
    const suffix = crypto.randomUUID()
    const referral = await createReferralProgramFixture({
      createdById: user.id,
      hostname: `story-referral-${suffix}.example.com`,
      pathname: '/ref/%',
    })
    const hostnameId = await insertTestUrlHostname({ hostname: referral.hostname })
    const referralUrlId = await insertTestUrl({
      url: `https://${referral.hostname}/ref/story`,
      hostnameId,
    })
    const allowed = await insertTestUrlDirect(
      null,
      `https://story-allowed-${suffix}.example.test/article`,
    )
    if (!allowed) throw new Error('Expected allowed URL fixture')
    const story = await insertTestStory({ title: `Projection capacity ${suffix}` })
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: referralUrlId, count: 1 })
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: allowed.id, count: 1 })
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await drainStoryPostRelatedUrlProjection(post.id)
    expect(
      await getEntityRelation('relation__post__related__url', post.id, allowed.id),
    ).toHaveLength(0)
    expect(
      await getEntityRelation('relation__post__related__url', post.id, referralUrlId),
    ).toHaveLength(0)
  })
})
