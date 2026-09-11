import {
  entityRelationMetadatum,
  getEntityRelationIntegrityTargetColumn,
} from '@voucha/types/entities/entity-relations-metadata'

export const voteIntegrityRelationTargets = entityRelationMetadatum.flatMap(metadata =>
  metadata.election
    ? [{ metadata, targetColumn: getEntityRelationIntegrityTargetColumn(metadata) }]
    : [],
)

const relationIdProjection = `COALESCE(${voteIntegrityRelationTargets
  .map(target => target.targetColumn)
  .join(', ')}) AS entity_relation_id`

export const VOTE_INTEGRITY_FLAG_TARGET_PROJECTION = `
  post_id,
  topic_id,
  hostname_id,
  rss_feed_item_id,
  ${relationIdProjection},
  agent_moderation_id`

export const VOTE_INTEGRITY_FLAG_PROJECTION = `
  id,
  ${VOTE_INTEGRITY_FLAG_TARGET_PROJECTION},
  flag_type,
  details,
  resolved_at,
  resolved_by_id,
  resolution,
  created_at`
