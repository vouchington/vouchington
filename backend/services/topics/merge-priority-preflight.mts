import type { TransactionQuery } from '@data-stores/psql'

// Every row here has more than one topic endpoint guarded by
// fn_ensure_active_topic_references. Each scan uses its endpoint index and raw
// primary key; no page walks the topic graph or all active operations.
const incidentTables = [
  { table: 'relation__topic__category__topic', columns: ['subject_id', 'object_id'] },
  { table: 'relation__topic__parent__topic', columns: ['subject_id', 'object_id'] },
  { table: 'relation__topic__publisher_type__topic', columns: ['subject_id', 'object_id'] },
  { table: 'relation__topic__related__topic', columns: ['subject_id', 'object_id'] },
  { table: 'card_topics', columns: ['topic_id', 'bank_topic_id', 'brand_topic_id'] },
  { table: 'rewards_program_topics', columns: ['topic_id', 'company_topic_id'] },
  { table: 'referral_program_topics', columns: ['topic_id', 'company_topic_id'] },
  { table: 'rewards_program_status_topics', columns: ['topic_id', 'lifetime_version_id'] },
  { table: 'topics', columns: ['id', 'rewards_program_topic_id', 'referral_program_topic_id'] },
] as const

const incidentScans = incidentTables.flatMap(({ table, columns }) =>
  columns.map(column => ({
    table,
    column,
    columns,
    rowKey: table.startsWith('relation__topic__')
      ? column === 'subject_id'
        ? 'object_id'
        : 'subject_id'
      : table === 'topics'
        ? 'id'
        : 'topic_id',
  })),
)

export const topicMergePriorityProbeCount = incidentScans.length

type IncidentRow = {
  page_key: string
  row_key: string
  topic_ids: (string | null)[]
}

export async function processTopicMergePriorityPreflightPage(
  query: TransactionQuery,
  operationId: string,
  participantIds: readonly string[],
  position: number,
  cursorPageKey: string | null,
  cursorRowKey: string | null,
  limit: number,
): Promise<{
  hasMore: boolean
  cursorPageKey: string | null
  cursorRowKey: string | null
  conflict: boolean
}> {
  const scan = incidentScans[position]
  if (!scan) throw new RangeError('Invalid topic merge priority scan')
  const { table, column, columns, rowKey } = scan
  const singleKey = column === rowKey
  const cursorPredicate = `(p.${column}, p.${rowKey}) > ($2::uuid, $3::uuid)`
  const { rows } = await query<IncidentRow>(
    `/* processTopicMergePriorityPreflightPage raw page */
      SELECT p.${column} AS page_key, p.${rowKey} AS row_key,
        ARRAY[${columns.map(endpoint => `p.${endpoint}`).join(', ')}] AS topic_ids
      FROM ${table} p
      WHERE p.${column} = ANY($1::uuid[])
        AND ($2::uuid IS NULL OR ${cursorPredicate})
      ORDER BY p.${column}${singleKey ? '' : `, p.${rowKey}`}
      LIMIT $4::integer`,
    [participantIds, cursorPageKey, cursorRowKey, limit],
  )
  const last = rows.at(-1)
  const endpointIds = [
    ...new Set(rows.flatMap(row => row.topic_ids.filter((id): id is string => id !== null))),
  ]
  const conflict =
    endpointIds.length > 0 && (await olderTopicMergeOwnsAny(query, operationId, endpointIds))
  return {
    hasMore: rows.length === limit,
    cursorPageKey: last?.page_key ?? cursorPageKey,
    cursorRowKey: last?.row_key ?? cursorRowKey,
    conflict,
  }
}

/** Active participant indexes bound each candidate endpoint lookup. */
export async function olderTopicMergeOwnsAny(
  query: TransactionQuery,
  operationId: string,
  endpointIds: readonly string[],
): Promise<boolean> {
  if (endpointIds.length === 0) return false
  const { rows } = await query<{ id: string }>(
    `/* olderTopicMergeOwnsAny */ WITH owner AS MATERIALIZED (
      SELECT id, admission_position FROM topic_merge_operations
      WHERE source_topic_id = ANY($2::uuid[])
        AND completed_at IS NULL AND failed_at IS NULL
      UNION ALL
      SELECT id, admission_position FROM topic_merge_operations
      WHERE destination_topic_id = ANY($2::uuid[])
        AND completed_at IS NULL AND failed_at IS NULL
    )
    SELECT owner.id FROM owner
    JOIN topic_merge_operations candidate ON candidate.id = $1::uuid
    WHERE owner.admission_position < candidate.admission_position
    LIMIT 1`,
    [operationId, endpointIds],
  )
  return rows.length > 0
}
