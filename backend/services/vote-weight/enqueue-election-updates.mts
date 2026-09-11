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
} from '@queues/elections/enqueues'
import {
  createEntityRelationElectionTarget,
  entityRelationElectionTables,
} from '@services/elections-votes/entity-relation'

type EntityRow = {
  entity_type: string
  entity_id: string
  relation_table: string | null
}

export async function enqueueElectionUpdatesForUser(userId: string): Promise<void> {
  const { rows } = await read<EntityRow>(sql`/* enqueueElectionUpdatesForUser */
    SELECT 'post' AS entity_type, post_id AS entity_id, NULL::text AS relation_table
    FROM post_votes
    WHERE user_id = ${userId}

    UNION ALL

    SELECT 'topic', topic_id, NULL
    FROM topic_votes
    WHERE user_id = ${userId}

    UNION ALL

    SELECT 'hostname', hostname_id, NULL
    FROM hostname_votes
    WHERE user_id = ${userId}

    UNION ALL

    SELECT 'rss_feed_item', rss_feed_item_id, NULL
    FROM rss_feed_item_votes
    WHERE user_id = ${userId}

    UNION ALL

    SELECT 'entity_relation', entity_relation_id, relation_table
    FROM entity_relation_votes
    WHERE user_id = ${userId}

    UNION ALL

    SELECT 'agent_moderation', agent_moderation_id, NULL
    FROM agent_moderation_votes
    WHERE user_id = ${userId}

    UNION ALL

    SELECT 'user_vouch', target_user_id, NULL
    FROM user_vouch_votes
    WHERE user_id = ${userId}
  `)

  const byType = new Map<string, string[]>()
  for (const row of rows) {
    const ids = byType.get(row.entity_type) ?? []
    ids.push(row.entity_id)
    byType.set(row.entity_type, ids)
  }

  const entityRelationTargets = rows.flatMap(row =>
    row.entity_type === 'entity_relation' &&
    row.relation_table &&
    entityRelationElectionTables.has(row.relation_table)
      ? [createEntityRelationElectionTarget(row.entity_id, row.relation_table)]
      : [],
  )
  await Promise.all([
    enqueueBulkUpdatePostElectionVoteStats(byType.get('post') ?? []),
    enqueueBulkUpdateTopicElectionVoteStats(byType.get('topic') ?? []),
    enqueueBulkUpdateHostnameElectionVoteStats(byType.get('hostname') ?? []),
    enqueueBulkUpdateRssFeedItemElectionVoteStats(byType.get('rss_feed_item') ?? []),
    enqueueBulkUpdateEntityRelationElectionVoteStats(entityRelationTargets),
    enqueueBulkUpdateAgentModerationElectionVoteStats(byType.get('agent_moderation') ?? []),
    enqueueBulkUpdateUserVouchElectionVoteStats(byType.get('user_vouch') ?? []),
  ])
}
