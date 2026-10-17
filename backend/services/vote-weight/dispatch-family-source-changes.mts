import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  VoteWeightDispatchPage,
  VoteWeightDispatchWindow,
  VoteWeightFamilySourceChangesData,
  VoteWeightTimestampKeyset,
} from '@queues/vote-aggregation/enqueues/types-dispatch'
import { beginVoteWeightDispatch } from './dispatch-cursor.mts'
import { findRejectedEvidenceEvents } from './dispatch-rejected-evidence.mts'
import { getVoteWeightDispatchBatchSize } from './work-limits.mts'

const BRANCHES = ['updated_at', 'effective_at', 'expires_at'] as const
type Branch = (typeof BRANCHES)[number]
type Row = { at: string; id: string; user_id: string | null; changed_at_epoch_ms: string }

export async function dispatchVoteWeightFamilySourceChanges(
  data: VoteWeightFamilySourceChangesData = {},
): Promise<VoteWeightDispatchPage<VoteWeightFamilySourceChangesData>> {
  const window =
    data.window ??
    (await beginVoteWeightDispatch('family_source_changes', new Date(), {
      fullReplay: data.fullReplay,
    }))
  const cap = getVoteWeightDispatchBatchSize()
  const branches = { ...data.branches }
  const events = []
  const select = async (branch: Branch) => ({
    branch,
    rows:
      branches[branch] === null
        ? null
        : await findFamilySourceChangeRows(branch, window, branches[branch], cap),
  })
  const pages = await Promise.all([
    select('updated_at'),
    select('effective_at'),
    select('expires_at'),
  ])
  for (const { branch, rows } of pages) {
    if (rows === null) continue
    for (const row of rows) {
      if (!row.user_id) continue
      events.push({
        userId: row.user_id,
        jobId: `voteWeight__${row.user_id}__familySource__${row.id}__${row.changed_at_epoch_ms}`,
      })
    }
    const last = rows.at(-1)
    branches[branch] = rows.length === cap && last ? { at: last.at, id: last.id } : null
  }
  if (branches.rejected_at !== null) {
    const rejected = await findRejectedEvidenceEvents(window, branches.rejected_at, cap)
    events.push(...rejected.events)
    branches.rejected_at = rejected.next
  }
  const hasMore = ([...BRANCHES, 'rejected_at'] as const).some(branch => branches[branch] !== null)
  return { window, events, hasMore, continuation: hasMore ? { window, branches } : null }
}

async function findFamilySourceChangeRows(
  branch: Branch,
  window: VoteWeightDispatchWindow,
  after: VoteWeightTimestampKeyset | undefined,
  cap: number,
): Promise<Row[]> {
  // Column names come exclusively from the finite branch set above.
  const timestamp = `source_state.${branch}`
  const id = 'source_state.membership_source_id'
  const query = sql``.append(`/* dispatchVoteWeightFamilySourceChanges:${branch} */
    SELECT ${timestamp}::text AS at, ${id} AS id, membership.user_id,
      floor(extract(epoch FROM ${timestamp}) * 1000)::text AS changed_at_epoch_ms
    FROM membership_source_states source_state`)
  query.append(` LEFT JOIN LATERAL (
    SELECT user_id FROM memberships
    WHERE membership_source_id = source_state.membership_source_id AND projection_ended_at IS NULL
    LIMIT 1
  ) membership ON true
    WHERE ${timestamp} IS NOT NULL`)
  query.append(" AND source_state.source_kind = 'family'")
  query
    .append(sql` AND `)
    .append(timestamp)
    .append(sql` <= ${window.windowEnd}::timestamptz`)
  if (window.windowStart)
    query.append(` AND ${timestamp}`).append(sql` >= ${window.windowStart}::timestamptz`)
  if (after)
    query
      .append(` AND (${timestamp}, ${id})`)
      .append(sql` > (${after.at}::timestamptz, ${after.id}::uuid)`)
  query.append(` ORDER BY ${timestamp}, ${id}`).append(sql` LIMIT ${cap}`)
  const { rows } = await write<Row>(query)
  return rows
}
