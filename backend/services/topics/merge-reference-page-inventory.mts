import { plainReferences, collisionReferences } from './merge-references.mts'
import { subtypeReferences } from './merge-subtypes.mts'
import { relationReferences, relationElectionTables } from './merge-relations.mts'

export const topicMergePlainPages = plainReferences.flatMap(reference =>
  reference.columns.map(column => ({ table: reference.table, columns: [column] })),
)
export const topicMergeSubtypePages = [
  ...subtypeReferences.flatMap(reference =>
    reference.columns.map(column => ({ table: reference.table, columns: [column] })),
  ),
  { table: 'rewards_program_status_topics', columns: ['lifetime_version_id'] },
]
export const topicMergeCollisionPages = collisionReferences
export const topicMergeBookmarkPages = Object.entries(relationReferences).flatMap(
  ([table, columns]) =>
    relationElectionTables.has(table)
      ? []
      : [
          {
            table,
            columns,
            collisionKey: ['subject_id', 'object_id'],
            live: 'deleted_at IS NULL',
          },
        ],
)

export const topicMergeReferencePageTables = [
  ...topicMergePlainPages,
  ...topicMergeSubtypePages,
  ...collisionReferences,
  ...topicMergeBookmarkPages,
].map(reference => reference.table)

export const topicMergeReferencePageColumns = [
  'lifetime_version_id',
  'topic_id',
  'referral_program_topic_id',
  'rewards_program_topic_id',
  'rewards_program_status_topic_id',
  'spending_category_topic_id',
  'card_topic_id',
  'created_topic_id',
  'bank_topic_id',
  'brand_topic_id',
  'company_topic_id',
  'retailer_topic_id',
  'subject_id',
  'object_id',
  'post_id',
  'community_id',
  'aside_type',
  'claimant_user_id',
  'user_id',
]
