import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import { getPrivateUserByAny } from '@services/users/get'
import { upsertSystemUser } from '@services/users/system-users'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { drainStoryPostRelatedUrlProjection } from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'

describe('story related URL confirmation during refresh', () => {
  it('preserves a manual confirmation through the restarted projection', async () => {
    const [actor, storyTellerIdentity, story, sourceUrl, confirmedUrl] = await Promise.all([
      createTestUserDirect(),
      upsertSystemUser('story-teller'),
      insertTestStory(),
      insertTestUrlDirect(null, `https://example.com/story-source-${crypto.randomUUID()}`),
      insertTestUrlDirect(null, `https://example.com/story-confirmed-${crypto.randomUUID()}`),
    ])
    const storyTeller = await getPrivateUserByAny(storyTellerIdentity.id, { readOnly: false })
    if (!sourceUrl || !confirmedUrl || !storyTeller) throw new Error('Expected projection fixtures')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: sourceUrl.id, count: 2 })
    const { post } = (await prepareStoryPost(story.id, actor)).response
    await drainStoryPostRelatedUrlProjection(post.id)

    const relatedUrl = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })
    const subject = { id: post.id }
    const confirmation = [{ id: confirmedUrl.id }]
    await upsertEntityRelation(storyTeller, relatedUrl, subject, confirmation)
    await softDeleteEntityRelation(storyTeller, relatedUrl, subject, confirmation)
    await refreshStoryPostForStory(story.id)

    const restore = afterPostgresTransactionQueryForTest(
      '/* getPostStoryByStoryId */',
      values => values.includes(story.id),
      async () => {
        await upsertEntityRelation(actor, relatedUrl, subject, confirmation)
      },
    )
    try {
      await refreshStoryPostForStory(story.id)
    } finally {
      restore()
    }

    await drainStoryPostRelatedUrlProjection(post.id)
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(
      [sourceUrl.id, confirmedUrl.id].toSorted(),
    )
  })
})
