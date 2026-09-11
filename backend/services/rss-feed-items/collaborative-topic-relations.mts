import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import { getSystemUserByUsername } from '@services/users/system-users'
import {
  getEntityRelationMetadataOrThrow,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import { RSS_FEED_COLLABORATIVE_CATEGORIZER_USERNAME } from '@services/users/constants'
import type { BasicUser } from '@services/users/types'

export type CollaborativeTopicLimits = {
  plusLimit: number
  proLimit: number
}

type TopicFollowerRow = { topic_id: string }

// Lazy-cached mapper context; resolved once per process lifetime. The collaborative voter is
// distinct from the RSS category mapper so unlinking an alias can retract only alias-derived
// support while retaining independently-derived collaborative support on the shared relation.
let mapperContext: { mapper: BasicUser; relation: EntityRelationMetadata } | null = null

async function getMapperContext(): Promise<{
  mapper: BasicUser
  relation: EntityRelationMetadata
} | null> {
  if (mapperContext) return mapperContext
  const mapper = await getSystemUserByUsername(RSS_FEED_COLLABORATIVE_CATEGORIZER_USERNAME)
  if (!mapper) return null
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'rss_feed_item',
    objectType: 'topic',
    predicate: 'category',
  })
  mapperContext = { mapper, relation }
  return mapperContext
}

/**
 * Adds up to `limits.plusLimit` topics followed by "plus" plan followers of an RSS feed item's
 * source feed(s), plus up to `limits.proLimit` more followed by "pro" plan followers -- a no-LLM
 * collaborative-filtering pass. A no-op when the item has zero paid followers (both pools
 * naturally return no rows) or every matching topic already has a positive collaborative vote.
 *
 * Returns the written relations. Their vote-stats recompute (which drives whether they surface as
 * "topic chips" on the item, gated by `votes_score_net`) is enqueued fire-and-forget — see
 * services/elections-votes/CLAUDE.md's "intentionally asynchronous" design. Callers that read
 * vote-gated data back out (tests included) should poll for each relation's `object_id` to appear
 * in the read side effect rather than depending on `backend/workers/*` (workers/CLAUDE.md: workers
 * depend on services, never the reverse).
 */
export async function applyCollaborativeTopicRelations(
  rssFeedItemId: string,
  limits: CollaborativeTopicLimits,
): Promise<EntityRelation[]> {
  const ctx = await getMapperContext()
  /* v8 ignore start -- only reachable if rss-feed-categorizer user absent; db:migrate always seeds it */
  if (!ctx) {
    onError(
      new Error(
        `System user '${RSS_FEED_COLLABORATIVE_CATEGORIZER_USERNAME}' not found — cannot apply collaborative topic relations`,
      ),
    )
    return []
  }
  /* v8 ignore stop */
  const { mapper, relation } = ctx

  // Sequential, not Promise.all: the pro query must exclude the plus pool's topic ids so its own
  // LIMIT is applied to plus-exclusive candidates, not truncated before the exclusion can happen.
  const plusRows = await selectPaidFollowerTopics(
    rssFeedItemId,
    mapper.id,
    'plus',
    limits.plusLimit,
  )
  const proRows = await selectPaidFollowerTopics(
    rssFeedItemId,
    mapper.id,
    'pro',
    limits.proLimit,
    plusRows.map(row => row.topic_id),
  )

  const pairs = [...plusRows, ...proRows].map(row => ({
    subject: { id: rssFeedItemId },
    object: { id: row.topic_id },
  }))
  if (pairs.length === 0) return []

  return writeEntityRelations(relation, mapper, pairs, { vote: true })
}

async function selectPaidFollowerTopics(
  rssFeedItemId: string,
  collaborativeCategorizerId: string,
  plan: 'plus' | 'pro',
  limit: number,
  excludeTopicIds: string[] = [],
): Promise<TopicFollowerRow[]> {
  const { rows } = await read(sql`/* selectPaidFollowerTopics */
    WITH item_feeds AS (
      SELECT rss_feed_id FROM rss_feed_item_sources WHERE rss_feed_item_id = ${rssFeedItemId}
    ),
    plan_followers AS (
      SELECT DISTINCT uf.subject_id AS user_id
      FROM relation__user__follow__rss_feed uf
      JOIN item_feeds f ON f.rss_feed_id = uf.object_id
      JOIN view_current_paid_memberships m ON m.user_id = uf.subject_id
        AND m.plan = ${plan}
      WHERE uf.deleted_at IS NULL
    ),
    already_tagged AS (
      SELECT relation.object_id AS topic_id
      FROM relation__rss_feed_item__category__topic relation
      JOIN LATERAL (
        SELECT score
        FROM entity_relation_votes
        WHERE relation_table = 'relation__rss_feed_item__category__topic'
          AND entity_relation_id = relation.id
          AND user_id = ${collaborativeCategorizerId}
        ORDER BY id DESC
        LIMIT 1
      ) collaborative_vote ON collaborative_vote.score = 1
      WHERE relation.subject_id = ${rssFeedItemId} AND relation.deleted_at IS NULL
      UNION
      SELECT unnest(${excludeTopicIds}::uuid[])
    )
    SELECT ft.object_id AS topic_id, COUNT(DISTINCT ft.subject_id) AS follower_count
    FROM relation__user__follow__topic ft
    JOIN plan_followers pf ON pf.user_id = ft.subject_id
    JOIN topics t ON t.id = ft.object_id AND t.deleted_at IS NULL AND t.merged_into_topic_id IS NULL
    WHERE ft.deleted_at IS NULL AND ft.object_id NOT IN (SELECT topic_id FROM already_tagged)
    GROUP BY ft.object_id
    ORDER BY follower_count DESC, ft.object_id
    LIMIT ${limit}
  `)
  return rows as TopicFollowerRow[]
}
