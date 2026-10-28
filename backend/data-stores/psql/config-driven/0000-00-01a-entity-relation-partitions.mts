import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { generateDefaultPartitions } from '@vouchington/postgres/partitions'

/** loaded by path by the config-driven migration runner */
export default function generateEntityRelationPartitionsSql(): string {
  // Get all table names where post is the subject.
  // User-subject tables are not partitioned (see 0000-00-01-entity-relations.mts).
  const postSubjectTables = entityRelationMetadatum.flatMap(m =>
    m.subject_type === 'post' ? [m.table_name] : [],
  )

  if (postSubjectTables.length === 0) {
    return ''
  }

  const partitions = generateDefaultPartitions(postSubjectTables)
  // The topic viewer count joins topic-bound positive post relations. For these current
  // default-only partitions, object_id and votes_score_net are correlated: an object may have
  // many zero-vote rows but few positives. Child MCV statistics keep the positive candidate
  // estimate accurate so the planner probes posts by candidate id instead of hashing all posts.
  return `${partitions}

CREATE STATISTICS IF NOT EXISTS statistics_post_category_topic_object_vote_score_mcv (mcv)
ON object_id, votes_score_net FROM relation__post__category__topic__default;

CREATE STATISTICS IF NOT EXISTS statistics_post_category_topic_alias_object_vote_score_mcv (mcv)
ON object_id, votes_score_net FROM relation__post__category__topic_alias__default;`
}
