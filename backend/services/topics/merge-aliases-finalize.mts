import { maintainBookmarkBloomForRelations } from '@services/entity-relations/bookmark-bloom-maintenance'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import {
  aggregateElectionVoteStatsFromPrimary,
  updateElectionStatsIfChanged,
} from '@services/elections-votes/shared'
import { TOPIC_ELECTION_CONFIG } from '@services/elections-votes/topic/config'
import { updateEntityRelationElectionVoteStatsFromPrimaryBatch } from '@services/elections-votes/entity-relation/vote-stats-batch'
import type { EntityRelationElectionTarget } from '@queues/vote-aggregation/enqueues/types-elections'
import { beginTransaction } from '@data-stores/psql'
import { updateTopicRatingStats } from './ratings.mts'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueOnTopicUpdated } from '@queues/entity-listeners/enqueues'
import { enqueueBulkTopicAliasesUpdate } from '@queues/rss-feed-maintenance/enqueues/topic-aliases'
import { normalizeKey } from '@ts-shared/utils/strings'
import assert from 'http-assert'
import { getTopicByAny } from './get.mts'
import { invalidatePostsForTopicAliases } from './invalidate-posts-for-topic-aliases.mts'
import type { Topic } from './types.mts'
import type { PrivateUser } from '@services/users/types'

export async function finalizeTopicAliasMerge(input: {
  merger: PrivateUser
  sourceTopic: Topic
  destinationTopic: Topic
  movedAliases: string[]
  relationElectionTargets: EntityRelationElectionTarget[]
  previousRelationElectionTargets: EntityRelationElectionTarget[]
  bookmarkMoves: Array<{ relationTable: string; subject_id: string; object_id: string }>
  movedAliasIds: string[]
}) {
  const { merger, sourceTopic, destinationTopic, movedAliases, movedAliasIds } = input
  await refreshMergedTopicMetrics(destinationTopic.id, input.relationElectionTargets)
  void addEntityBloomKeys('topics', movedAliases.map(normalizeKey))
  await repairMergedTopicBookmarkBlooms(input.bookmarkMoves)
  await Promise.all([
    invalidate.entity_relation_elections(...input.previousRelationElectionTargets),
    invalidate.topic_elections(sourceTopic.id, destinationTopic.id),
    invalidate.topicsWithMetrics(
      sourceTopic.id,
      sourceTopic.slug,
      destinationTopic.id,
      destinationTopic.slug,
      movedAliases,
    ),
    invalidatePostsForTopicAliases(movedAliasIds),
  ])
  void enqueueBulkTopicAliasesUpdate([sourceTopic.id, destinationTopic.id])
  void enqueueOnTopicUpdated(sourceTopic.id, merger.id)
  void enqueueOnTopicUpdated(destinationTopic.id, merger.id)
  const refreshedDestinationTopic = await getTopicByAny(destinationTopic.id)
  assert(refreshedDestinationTopic, 500, 'Merged destination topic not found')
  return refreshedDestinationTopic
}

async function refreshMergedTopicMetrics(
  topicId: string,
  relationTargets: EntityRelationElectionTarget[],
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- refresh committed relation tallies before rebuilding the destination's primary election and rating projections.
  await updateEntityRelationElectionVoteStatsFromPrimaryBatch(relationTargets)
  const stats = await aggregateElectionVoteStatsFromPrimary(TOPIC_ELECTION_CONFIG, topicId)
  await updateElectionStatsIfChanged(TOPIC_ELECTION_CONFIG, topicId, stats)
  await updateTopicRatingStats(topicId)
  await using query = await beginTransaction()
  await query(
    `/* refreshMergedTopicBookmarkStats */ SELECT fn_update_topic_bookmark_stats_for_topic_id($1::uuid)`,
    [topicId],
  )
  await query.commit()
}

async function repairMergedTopicBookmarkBlooms(
  moves: Array<{ relationTable: string; subject_id: string; object_id: string }>,
): Promise<void> {
  for (const relation of entityRelationMetadatum) {
    if (!relation.is_bookmark || relation.subject_type !== 'user') continue
    const changes = moves.filter(move => move.relationTable === relation.table_name)
    // oxlint-disable-next-line no-await-in-loop -- relation kinds are a finite metadata set; each handler batches owned destinations.
    await maintainBookmarkBloomForRelations(relation, changes)
  }
}
