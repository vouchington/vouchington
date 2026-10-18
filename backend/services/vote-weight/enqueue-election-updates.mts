import { getEntityRelationVoteTableIdentifier } from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  enqueueBulkUpdatePostElectionVoteStats,
  enqueueBulkUpdateTopicElectionVoteStats,
  enqueueBulkUpdateHostnameElectionVoteStats,
  enqueueBulkUpdateRssFeedItemElectionVoteStats,
  enqueueBulkUpdateEntityRelationElectionVoteStats,
  enqueueBulkUpdateAgentModerationElectionVoteStats,
  enqueueBulkUpdateUserVouchElectionVoteStats,
} from '@queues/vote-aggregation/enqueues/elections'
import { enqueueUserElectionFanOut } from '@queues/vote-aggregation/enqueues/vote-weight'
import type { UserElectionFanOutCursor } from '@queues/vote-aggregation/enqueues/types-vote-weight'
import {
  createEntityRelationElectionTarget,
  entityRelationElectionTables,
} from '@services/elections-votes/entity-relation'
import { getPagedDispatchLimit } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'

type EntityRow = {
  entity_type: string
  entity_id: string
  entity_relation: string | null
}

type PageRow = EntityRow & { lane: number; sort_id: string }

export type ElectionUpdatePage = {
  /** Ids of the election jobs this page admitted. */
  jobIds: string[]
  /** Where the next page resumes, or null when this page reached the end of the user's votes. */
  nextCursor: UserElectionFanOutCursor | null
}

// Sorts before every UUID, so the first page needs no separate "no cursor" predicate.
const START_OF_IDS = '00000000-0000-0000-0000-000000000000'

/**
 * Queues the recompute of the elections the user has voted in, from `cursor` (the start by
 * default). The request admits one dispatcher; its worker reads bounded pages and stores each
 * continuation cursor in job data, keeping large vote histories off the request path.
 */
export async function enqueueElectionUpdatesForUser(
  userId: string,
  cursor: UserElectionFanOutCursor | null = null,
): Promise<void> {
  await enqueueUserElectionFanOut(userId, cursor)
}

/**
 * Reads one page of the user's votes ordered by (lane, id) after `cursor`, and enqueues the
 * election recompute for each. Each lane is one vote table; a page that is not full is the last.
 */
export async function enqueueElectionUpdatePageForUser(
  userId: string,
  cursor: UserElectionFanOutCursor | null,
  limit = getPagedDispatchLimit('elections_page_size'),
): Promise<ElectionUpdatePage> {
  const lane = cursor?.lane ?? 0
  const afterId = cursor?.afterId ?? START_OF_IDS
  const statement = sql`/* enqueueElectionUpdatesForUser */
    SELECT lane, entity_type, entity_id, entity_relation, sort_id FROM (
      (SELECT 1 AS lane, 'post' AS entity_type, post_id AS entity_id, NULL::text AS entity_relation, post_id AS sort_id
      -- no-mistakes-disable-next-line postgres-required-predicates: a user-wide vote lookup spans target-ID partitions for every vote table
      FROM post_votes
      WHERE user_id = ${userId} AND (1 > ${lane}::int OR (1 = ${lane}::int AND post_id > ${afterId}::uuid))
      ORDER BY post_id LIMIT ${limit})

      UNION ALL

      (SELECT 2, 'topic', topic_id, NULL, topic_id
      -- no-mistakes-disable-next-line postgres-required-predicates: a user-wide vote lookup spans target-ID partitions for every vote table
      FROM topic_votes
      WHERE user_id = ${userId} AND (2 > ${lane}::int OR (2 = ${lane}::int AND topic_id > ${afterId}::uuid))
      ORDER BY topic_id LIMIT ${limit})

      UNION ALL

      (SELECT 3, 'hostname', hostname_id, NULL, hostname_id
      -- no-mistakes-disable-next-line postgres-required-predicates: a user-wide vote lookup spans target-ID partitions for every vote table
      FROM hostname_votes
      WHERE user_id = ${userId} AND (3 > ${lane}::int OR (3 = ${lane}::int AND hostname_id > ${afterId}::uuid))
      ORDER BY hostname_id LIMIT ${limit})

      UNION ALL

      (SELECT 4, 'rss_feed_item', rss_feed_item_id, NULL, rss_feed_item_id
      -- no-mistakes-disable-next-line postgres-required-predicates: a user-wide vote lookup spans target-ID partitions for every vote table
      FROM rss_feed_item_votes
      WHERE user_id = ${userId} AND (4 > ${lane}::int OR (4 = ${lane}::int AND rss_feed_item_id > ${afterId}::uuid))
      ORDER BY rss_feed_item_id LIMIT ${limit})

      UNION ALL

      (SELECT 6, 'agent_moderation', agent_moderation_id, NULL, agent_moderation_id
      -- no-mistakes-disable-next-line postgres-required-predicates: a user-wide vote lookup spans target-ID partitions for every vote table
      FROM agent_moderation_votes
      WHERE user_id = ${userId} AND (6 > ${lane}::int OR (6 = ${lane}::int AND agent_moderation_id > ${afterId}::uuid))
      ORDER BY agent_moderation_id LIMIT ${limit})

      UNION ALL

      (SELECT 7, 'user_vouch', target_user_id, NULL, target_user_id
      -- no-mistakes-disable-next-line postgres-required-predicates: a user-wide vote lookup spans target-ID partitions for every vote table
      FROM user_vouch_votes
      WHERE user_id = ${userId} AND (7 > ${lane}::int OR (7 = ${lane}::int AND target_user_id > ${afterId}::uuid))
      ORDER BY target_user_id LIMIT ${limit})
  `
  appendRelationVoteLanes(statement, userId, lane, afterId, limit)
  statement.append(sql`
    ) page
    ORDER BY lane, sort_id
    LIMIT ${limit}
  `)
  const { rows } = await read<PageRow>(statement)

  const byType = new Map<string, string[]>()
  for (const row of rows) {
    const ids = byType.get(row.entity_type) ?? []
    ids.push(row.entity_id)
    byType.set(row.entity_type, ids)
  }

  const entityRelationTargets = rows.flatMap(row =>
    row.entity_type === 'entity_relation' &&
    row.entity_relation &&
    entityRelationElectionTables.has(row.entity_relation)
      ? [createEntityRelationElectionTarget(row.entity_id, row.entity_relation)]
      : [],
  )
  const enqueueResults = await Promise.all([
    enqueueBulkUpdatePostElectionVoteStats(byType.get('post') ?? []),
    enqueueBulkUpdateTopicElectionVoteStats(byType.get('topic') ?? []),
    enqueueBulkUpdateHostnameElectionVoteStats(byType.get('hostname') ?? []),
    enqueueBulkUpdateRssFeedItemElectionVoteStats(byType.get('rss_feed_item') ?? []),
    enqueueBulkUpdateEntityRelationElectionVoteStats(entityRelationTargets),
    enqueueBulkUpdateAgentModerationElectionVoteStats(byType.get('agent_moderation') ?? []),
    enqueueBulkUpdateUserVouchElectionVoteStats(byType.get('user_vouch') ?? []),
  ])
  const last = rows.at(-1)
  return {
    jobIds: enqueueResults.flatMap(getBulkEnqueuedJobIds),
    nextCursor: last && rows.length === limit ? { lane: last.lane, afterId: last.sort_id } : null,
  }
}

export function getBulkEnqueuedJobIds(result: unknown): string[] {
  if (!Array.isArray(result)) {
    throw new Error('Expected election bulk enqueue to return an array of persisted jobs')
  }

  return result.map(job => {
    if (
      typeof job !== 'object' ||
      job === null ||
      typeof (job as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('Expected election bulk enqueue to return jobs with string ids')
    }
    return (job as { id: string }).id
  })
}

/** Relation lanes use ballot event ids, so identical target ids across families never collide. */
function appendRelationVoteLanes(
  statement: ReturnType<typeof sql>,
  userId: string,
  afterLane: number,
  afterId: string,
  limit: number,
): void {
  let lane = 8
  for (const relationTable of entityRelationElectionTables) {
    const currentLane = lane++
    if (currentLane < afterLane) continue
    statement.append(sql` UNION ALL (SELECT ${currentLane}::int, 'entity_relation',
      entity_relation_id, ${relationTable}::text, id FROM `)
    statement.append(getEntityRelationVoteTableIdentifier(relationTable))
    statement.append(sql` WHERE user_id = ${userId}`)
    if (currentLane === afterLane) statement.append(sql` AND id > ${afterId}::uuid`)
    statement.append(sql` ORDER BY id LIMIT ${limit})`)
  }
}
