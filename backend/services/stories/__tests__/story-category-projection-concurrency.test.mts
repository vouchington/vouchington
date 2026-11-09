import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  addCategoryToRssFeedItem,
  beginTransaction,
  createTestUrlWithHostname,
  createTestUserDirect,
  getEntityRelation,
  getTestPostCategoryRelationIds,
  insertTestRssFeedItem,
  insertTestStory,
  insertTestTopic,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import {
  assignTestStoryItemInTransaction,
  deleteTestStoryItemCategory,
  getTestStoryCategoryVoteHistory,
  deleteTestStoryCategoryWork,
} from '@voucha/test-helpers/story-category-projection-fixtures'
import { upsertSystemUser } from '@services/users/system-users'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation/votes-upsert'
import { markStoryCategoryProjectionWork } from '@services/post-publication/story-category-projection-work'
import { loadStoryTellerUser } from '../story-post-create.mts'
import {
  markRssFeedItemCategorySnapshotsForReconciliation,
  reconcileRssFeedItemCategorySnapshots,
} from '@services/rss-feed-items/category-snapshot-reconciliations'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { reconcileStoryPostCategoryProjection } from '../story-post-category-projection.mts'

describe('story category projection concurrency', () => {
  it('keeps refresh a no-op for a missing story', async () => {
    await expect(refreshStoryPostForStory(randomUUID())).resolves.toBeNull()
  })

  it('repairs a category assigned while the initial post still sees the previous story membership', async () => {
    await upsertSystemUser('story-teller')
    const user = await createTestUserDirect()
    const feed = await createTestRssFeed({})
    const urlId = await createTestUrlWithHostname()
    const story = await insertTestStory({})
    const topicId = await insertTestTopic({
      name: `projection-${randomUUID()}`,
      slug: `projection-${randomUUID()}`,
      createdById: user.id,
    })
    async function makeItem() {
      const id = randomUUID()
      const data = { title: id, link: `https://example.test/${id}` }
      return insertTestRssFeedItem({
        rssFeedId: feed.id,
        urlId,
        guid: id,
        itemData: data,
        contentSha256: createHash('sha256').update(JSON.stringify(data)).digest(),
      })
    }
    const [first, second, incoming] = await Promise.all([makeItem(), makeItem(), makeItem()])
    await setTestItemStoryId(first, story.id)
    await setTestItemStoryId(second, story.id)
    await addCategoryToRssFeedItem(incoming, topicId)
    await using holder = await beginTransaction()
    await assignTestStoryItemInTransaction(holder, incoming, story.id)
    expect(await refreshStoryPostForStory(story.id, { query: holder })).toBeNull()
    const holderProcessId = await getTestPostgresBackendProcessId(holder)
    try {
      const prepared = await withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: 'markStoryCategoryProjectionWork',
          releaseHolder: () => holder[Symbol.asyncDispose](),
        },
        async waitForLock => {
          const creating = prepareStoryPost(story.id, user)
          await waitForLock(creating)
          await holder.commit()
          return creating
        },
      )
      const postId = prepared.response.post.id
      // The three one-item pages observe the incoming topic but do not complete the source walk.
      for (let page = 0; page < 3; page++) {
        const result = await reconcileStoryPostCategoryProjection({
          storyIds: [story.id],
          batchSize: 1,
        })
        expect(result.continue).toBe(true)
      }
      expect(
        await getEntityRelation('relation__post__category__topic', postId, topicId),
      ).toHaveLength(1)
      const [relationId] = await getTestPostCategoryRelationIds(postId)
      expect(relationId).toBeDefined()
      const actor = await loadStoryTellerUser()
      const relation = getEntityRelationMetadataOrThrow({
        subjectType: 'post',
        predicate: 'category',
        objectType: 'topic',
      })
      const [negativeVote] = await upsertEntityRelationElectionVotes(
        actor.id,
        [{ entityId: relationId!, score: -1 }],
        undefined,
        relation,
      )
      expect(negativeVote?.score).toBe(-1)
      const originalHistory = await getTestStoryCategoryVoteHistory(actor.id, relationId!)
      expect(originalHistory.at(-1)).toMatchObject({ id: expect.any(String), score: -1 })
      await using restart = await beginTransaction()
      await markStoryCategoryProjectionWork(restart, [story.id])
      await restart.commit()
      for (let page = 0; page < 20; page++) {
        const result = await reconcileStoryPostCategoryProjection({
          storyIds: [story.id],
          batchSize: 1,
        })
        if (!result.continue) break
        if (page === 19) throw new Error('Owned category replay did not finish')
      }
      expect(await getTestStoryCategoryVoteHistory(actor.id, relationId!)).toEqual(originalHistory)
      await using removal = await beginTransaction()
      await deleteTestStoryItemCategory(removal, incoming, topicId)
      await markRssFeedItemCategorySnapshotsForReconciliation(removal, [incoming])
      await removal.commit()
      expect(await reconcileRssFeedItemCategorySnapshots(1, [incoming])).toEqual({ reconciled: 1 })
      for (let page = 0; page < 20; page++) {
        const result = await reconcileStoryPostCategoryProjection({
          storyIds: [story.id],
          batchSize: 1,
        })
        if (!result.continue) break
        if (page === 19) throw new Error('Owned category removal projection did not finish')
      }
      expect(await getTestPostCategoryRelationIds(postId)).toEqual([])
    } finally {
      await deleteTestStoryCategoryWork([story.id])
    }
  })
})
