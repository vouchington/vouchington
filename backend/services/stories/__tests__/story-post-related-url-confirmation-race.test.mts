import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getPostRelatedUrlIds,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
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

    await using manual = await beginTransaction()
    const holderProcessId = await getTestPostgresBackendProcessId(manual)
    await upsertEntityRelation(actor, relatedUrl, subject, confirmation, { query: manual })
    await withTestOwnedPostgresWait(
      {
        pool: 'write',
        holderProcessId,
        lock: { kind: 'transaction' },
        queryMarker: 'lockStoryPostRelations:urls',
        releaseHolder: () => manual[Symbol.asyncDispose](),
      },
      async waitUntilRefreshCanContinue => {
        const refresh = refreshStoryPostForStory(story.id)
        await waitUntilRefreshCanContinue(refresh)
        await manual.commit()
        await refresh
      },
    )

    await drainStoryPostRelatedUrlProjection(post.id)
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(
      [sourceUrl.id, confirmedUrl.id].toSorted(),
    )
  })
})
