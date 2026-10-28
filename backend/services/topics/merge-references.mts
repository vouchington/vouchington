import { TOPIC_MERGE_REFERENCE_GROUPS } from './merge-reference-inventory.mts'
import type { MergeReferenceTable } from './merge-reference-sql.mts'

export const plainReferences = getPlainTopicMergeReferences()

export const collisionReferences: readonly MergeReferenceTable[] = [
  { table: 'post_data_point_topics', columns: ['topic_id'], collisionKey: ['post_id', 'topic_id'] },
  {
    table: 'post_explicit_topic_categories',
    columns: ['topic_id'],
    collisionKey: ['post_id', 'topic_id'],
  },
  {
    table: 'post_review_topic_ratings',
    columns: ['topic_id'],
    collisionKey: ['post_id', 'topic_id'],
  },
  {
    table: 'community_list_topics',
    columns: ['topic_id'],
    collisionKey: ['community_id', 'topic_id'],
    live: 'removed_at IS NULL',
  },
  {
    table: 'curated_aside_items',
    columns: ['topic_id'],
    collisionKey: ['aside_type', 'topic_id'],
    live: 'deleted_at IS NULL',
  },
  {
    table: 'topic_claims',
    preferVerified: true,
    columns: ['topic_id'],
    collisionKey: ['topic_id', 'claimant_user_id'],
    live: 'rejected_at IS NULL AND revoked_at IS NULL',
  },
  { table: 'topic_votes', columns: ['topic_id'], collisionKey: ['topic_id', 'user_id'] },
]

function getPlainTopicMergeReferences(): readonly MergeReferenceTable[] {
  const columnsByTable = new Map<string, string[]>()
  for (const [reference, group] of Object.entries(TOPIC_MERGE_REFERENCE_GROUPS)) {
    if (group !== 'references') continue
    const separator = reference.indexOf('.')
    const table = reference.slice(0, separator)
    const column = reference.slice(separator + 1)
    const columns = columnsByTable.get(table) ?? []
    columns.push(column)
    columnsByTable.set(table, columns)
  }
  return [...columnsByTable].map(([table, columns]) => ({ table, columns }))
}
