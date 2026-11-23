import { read, beginTransaction, registerPostCommitAction, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getSystemUserByUsername } from '@services/users/system-users'
import { assertEntityRelationUpsertAllowed } from '@services/entity-relations/upsert'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { recordPostPublicationChange } from '@services/post-publication'
import { enqueueStoryPostAgent } from '@queues/ai-agents/enqueues/story-post'
import { enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort } from '@queues/story-post-related-url-projections/enqueues'
import { getPostStoryByStoryId } from './get-post-stories.mts'
import {
  dispatchStoryPostRelationEffects,
  type StoryPostRelationEffects,
} from './story-post-relation-effects.mts'
import { markStoryPostRelatedUrlProjection } from './story-post-related-url-projection.mts'
import type { PrivateUser } from '@services/users/types'

type RefreshStoryPostQueryOptions = Omit<QueryOptions, 'query'> & {
  query?: TransactionQuery
  expectedPostId?: string
  captureCategoryChanges?: boolean
}
type RefreshStoryPostTransactionOptions = RefreshStoryPostQueryOptions & {
  query: TransactionQuery
}

export type StoryPostRefreshResult = {
  postId: string
  impactedTopicIds: string[]
  dispatchPostCommitEffects: () => Promise<void>
}

type RefreshedStoryPost = StoryPostRefreshResult &
  Pick<StoryPostRelationEffects, 'categoryTopicRelations'>

/**
 * If a story post exists for this story, refresh it:
 * re-aggregate topic relations and restart the durable URL projection, then
 * re-enqueue the story-post summarisation agent with force=true so a stale
 * ai_summary_markdown is overwritten.
 *
 * Assignment, removal, and clustering callers include this refresh in their transaction.
 * If no story post exists yet (the story was never turned into a post), this is a no-op.
 */
export async function refreshStoryPostForStory(
  storyId: string,
  options: RefreshStoryPostQueryOptions = {},
): Promise<RefreshedStoryPost | null> {
  const existingQuery = options.query
  if (!existingQuery) {
    await using query = await beginTransaction()
    const result = await refreshStoryPostForStoryInTransaction(storyId, { query })
    await query.commit()
    if (result) {
      await result.dispatchPostCommitEffects()
      void enqueueStoryPostAgent(result.postId, { force: true })
    }
    return result
  }
  return refreshStoryPostForStoryInTransaction(storyId, { ...options, query: existingQuery })
}

async function refreshStoryPostForStoryInTransaction(
  storyId: string,
  options: RefreshStoryPostTransactionOptions,
): Promise<RefreshedStoryPost | null> {
  const postStory = await getPostStoryByStoryId(storyId, options)
  if (!postStory || (options.expectedPostId && options.expectedPostId !== postStory.post_id))
    return null

  const postId = postStory.post_id
  const topicIdsToLock = await readStoryTopicIds(options.query, storyId)

  await options.query(sql`/* refreshStoryPostForStory:lockTopics */
    SELECT id FROM relation__post__category__topic
    WHERE subject_id = ${postId}
      AND (deleted_at IS NULL OR object_id = ANY(${topicIdsToLock}::uuid[]))
    ORDER BY subject_id, object_id FOR UPDATE`)

  // A concurrent manual confirmation must commit before the new generation copies its markers.
  await options.query(sql`/* lockStoryPostRelations:urls */
    SELECT id FROM relation__post__related__url WHERE subject_id = ${postId}
    ORDER BY subject_id, object_id FOR UPDATE`)

  // Category projection remains transaction-local. URL projection is durable and bounded;
  // it resumes after this membership transaction commits.
  await markStoryPostRelatedUrlProjection(options.query, postId, storyId)

  // Topic sources may change while the relation locks wait. Use the new snapshot for writes.
  const topicIds = await readStoryTopicIds(options.query, storyId)
  const storyTellerUser = await getStoryTellerUser()

  const { rows: priorTopicRows } = await read<{ object_id: string }>(
    sql`/* refreshStoryPostForStory:priorTopics */
      SELECT object_id
      FROM relation__post__category__topic
      WHERE subject_id = ${postId} AND deleted_at IS NULL
    `,
    options,
  )
  const priorTopicIds = priorTopicRows.map(row => row.object_id)
  const categoryTopicRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic',
    predicate: 'category',
  })

  // Category rows are deliberately locked and written in the existing relation-table order.
  if (topicIds.length > 0) {
    await assertEntityRelationUpsertAllowed(
      storyTellerUser,
      categoryTopicRelation,
      { id: postId },
      topicIds.map(id => ({ id })),
    )
  }
  await write(
    sql`/* refreshStoryPostForStory:pruneTopics */
      UPDATE relation__post__category__topic
      SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = ${storyTellerUser.id}
      WHERE subject_id = ${postId}
        AND deleted_at IS NULL
        AND (${topicIds.length} = 0 OR object_id != ALL(${topicIds}::uuid[]))
    `,
    options,
  )
  const categoryTopicRelations =
    topicIds.length > 0
      ? await writeEntityRelations(
          categoryTopicRelation,
          storyTellerUser,
          topicIds.map(id => ({ subject: { id: postId }, object: { id } })),
          { ...options, capturePublication: false },
        )
      : []

  const dispatchPostCommitEffects = async () => {
    await dispatchStoryPostRelationEffects(storyTellerUser, {
      relatedUrlRelation: getEntityRelationMetadataOrThrow({
        subjectType: 'post',
        objectType: 'url',
        predicate: 'related',
      }),
      relatedUrlRelations: [],
      categoryTopicRelation,
      categoryTopicRelations,
      handleVotes: false,
    })
  }
  const impactedTopicIds = [...new Set([...priorTopicIds, ...topicIds])]
  if (
    options.captureCategoryChanges &&
    (impactedTopicIds.length !== priorTopicIds.length ||
      impactedTopicIds.length !== topicIds.length)
  ) {
    await recordPostPublicationChange(options.query, {
      scope: { type: 'post', postId },
      reason: 'post_updated',
      impactedTopicIds,
    })
  }
  registerPostCommitAction(options.query, enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort)
  return {
    postId,
    impactedTopicIds,
    categoryTopicRelations,
    dispatchPostCommitEffects,
  }
}

async function readStoryTopicIds(query: TransactionQuery, storyId: string): Promise<string[]> {
  const { rows } = await query<{ topic_ids: string[] | null }>(
    sql`/* refreshStoryPostForStory */
    SELECT
      ARRAY_AGG(DISTINCT c.topic_id) FILTER (WHERE c.topic_id IS NOT NULL) AS topic_ids
    -- no-mistakes-disable-next-line postgres-required-predicates: story membership can attach already-created items, so item IDs may predate story_id
    FROM rss_feed_items rfi
    LEFT JOIN rss_feed_item_categories c
      ON c.rss_feed_item_id = rfi.id
      AND c.topic_id IS NOT NULL
    WHERE rfi.story_id = ${storyId}
      AND rfi.deleted_at IS NULL
  `,
  )

  return rows[0]?.topic_ids ?? []
}

async function getStoryTellerUser(): Promise<PrivateUser> {
  const systemUser = await getSystemUserByUsername('story-teller')
  if (!systemUser) throw new Error('refreshStoryPostForStory: @story-teller system user not found')
  return {
    __entity_type: 'user' as const,
    id: systemUser.id,
    username: systemUser.username,
    use_display_name_from: systemUser.use_display_name_from,
    roles: [] as readonly string[],
  } as unknown as PrivateUser
}
