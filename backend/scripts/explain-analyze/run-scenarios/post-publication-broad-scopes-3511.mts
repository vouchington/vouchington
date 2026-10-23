import { beginTransaction, read, write } from '@data-stores/psql'
import { recordPostPublicationChange } from '@services/post-publication/public'
import { claimPostPublicationDirtyWork } from '@services/post-publication/dirty-work'
import { listPublicationCandidatePage } from '@services/post-publication/publication-candidates'
import type { PostPublicationScope, PostPublicationReason } from '@services/post-publication/types'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runBroadPublicationScopeScenarios(postId: string): Promise<void> {
  const { rows: scopeIds } = await read<{
    community_id: string
    rss_feed_id: string
    topic_alias_id: string
    story_id: string
  }>(`/* readPostPublicationExplainScopeIds */ SELECT
      (SELECT id FROM communities WHERE deleted_at IS NULL ORDER BY id LIMIT 1) AS community_id,
      (SELECT id FROM rss_feeds WHERE deleted_at IS NULL ORDER BY id LIMIT 1) AS rss_feed_id,
      (SELECT id FROM topic_aliases ORDER BY id LIMIT 1) AS topic_alias_id,
      (SELECT id FROM stories WHERE deleted_at IS NULL ORDER BY id LIMIT 1) AS story_id`)
  const ids = scopeIds[0]
  if (!ids?.community_id || !ids.rss_feed_id || !ids.topic_alias_id || !ids.story_id)
    throw new Error('Missing representative broad publication scope identities')
  const entries: Array<{
    id: string
    scope: PostPublicationScope
    reason: PostPublicationReason
  }> = [
    {
      id: 'post-publication-candidate-author',
      scope: { type: 'author', authorUserId: seedUuid(99_990 % 20_000, '01') },
      reason: 'author_suspension_changed',
    },
    {
      id: 'post-publication-candidate-community',
      scope: { type: 'community', communityId: ids.community_id },
      reason: 'community_publication_changed',
    },
    {
      id: 'post-publication-candidate-rss-feed',
      scope: { type: 'rss_feed', rssFeedId: ids.rss_feed_id },
      reason: 'rss_feed_enablement_changed',
    },
    {
      id: 'post-publication-candidate-topic-alias',
      scope: { type: 'topic_alias', topicAliasId: ids.topic_alias_id },
      reason: 'post_topics_changed',
    },
    {
      id: 'post-publication-candidate-story',
      scope: { type: 'story', storyId: ids.story_id },
      reason: 'post_updated',
    },
  ]
  for (const entry of entries) {
    await using transaction = await beginTransaction()
    // no-mistakes-disable-next-line query-reached-per-item: five fixed scope fixtures capture under separate, globally ordered transaction locks.
    const work = await recordPostPublicationChange(transaction, {
      scope: entry.scope,
      reason: entry.reason,
      impactedPostIds: [postId],
    })
    await transaction.commit()
    try {
      // no-mistakes-disable-next-line query-reached-per-item: each fixed scenario claims its own exact generation after its capture commits.
      const claimed = await claimPostPublicationDirtyWork(work, 60)
      if (!claimed) throw new Error(`Expected to claim ${entry.id}`)
      registerScenarioContract(entry.id, {
        seededRows: { posts: 100_000 },
        expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 1_100 }],
      })
      // no-mistakes-disable-next-line query-reached-per-item: named scenario captures share process-global query state and must serialize.
      await runAndCapture(
        entry.id,
        async () => {
          const page = await listPublicationCandidatePage(claimed, 10)
          if (!page.hasMore || !page.cursorPostId) {
            throw new Error(`Missing ${entry.id} raw continuation`)
          }
        },
        undefined,
        'readRawPublicationCandidatePage',
      )
      const nearEnd = {
        ...claimed,
        cursor_post_id: uuidPredecessor(postId),
      }
      registerScenarioContract(`${entry.id}-late-page`, {
        seededRows: { posts: 100_000 },
        expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 1_100 }],
      })
      // no-mistakes-disable-next-line query-reached-per-item: each fixed late-page EXPLAIN capture follows its initial page under one scope claim.
      await runAndCapture(
        `${entry.id}-late-page`,
        async () => {
          const page = await listPublicationCandidatePage(nearEnd, 10)
          if (!page.posts.some(post => post.id === postId))
            throw new Error(`Missing ${entry.id} late candidate`)
        },
        undefined,
        'readRawPublicationCandidatePage',
      )
    } finally {
      // no-mistakes-disable-next-line query-reached-per-item: five fixed scenarios remove each owned key set before the next scope claim.
      await write(
        `/* removeBroadPostPublicationProbeKeys */
         DELETE FROM post_publication_dirty_work_keys WHERE dirty_work_id = $1::uuid`,
        [work.id],
      )
      // no-mistakes-disable-next-line query-reached-per-item: each owned work row is removed after its keys so the next scenario is isolated.
      await write(
        `/* removeBroadPostPublicationProbeWork */
         DELETE FROM post_publication_dirty_work WHERE id = $1::uuid`,
        [work.id],
      )
    }
  }
}

function uuidPredecessor(uuid: string): string {
  const value = (BigInt(`0x${uuid.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}
