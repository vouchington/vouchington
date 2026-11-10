import { beginTransaction, isUniqueViolation, type QueryExecutor } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'
import { recordMembershipChanges } from '../changes.mts'
import { getMembershipWorkLimits } from '../work-limits.mts'
import { activateOrphanedQueuedGrant } from './repair-orphaned-queued-activate.mts'

export { activateOrphanedQueuedGrant } from './repair-orphaned-queued-activate.mts'

export async function repairOrphanedQueuedGrantsBatch(
  cursor: string | null,
  batchSize = getMembershipWorkLimits().batchSize,
  userIds?: readonly string[],
): Promise<{ repaired: number; hasMore: boolean; nextCursor: string | null }> {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new RangeError('Membership orphan repair batch size must be a positive integer')
  if (userIds && userIds.length === 0) return { repaired: 0, hasMore: false, nextCursor: cursor }
  const selected = await readOrphanedQueuedGrantUserPage(cursor, batchSize, userIds)
  const repaired = await repairOrphanedQueuedGrantUsers(selected)
  return {
    repaired,
    hasMore: selected.length === batchSize,
    nextCursor: selected.at(-1) ?? null,
  }
}

async function readOrphanedQueuedGrantUserPage(
  cursor: string | null,
  batchSize: number,
  userIds?: readonly string[],
): Promise<string[]> {
  await using query = await beginTransaction()
  const selected = await readOrphanedQueuedGrantUserIds(cursor, batchSize, query, userIds)
  await query.commit()
  return selected
}

export async function readOrphanedQueuedGrantUserIds(
  cursor: string | null,
  batchSize: number,
  query: QueryExecutor,
  userIds?: readonly string[],
): Promise<string[]> {
  // One matching user per step, probed from the user index. A cancelled-state tail past
  // the page is not read. The lookups stay LATERAL so they cannot become the driving scan.
  const statement = sql`/* repairOrphanedQueuedGrantsBatch: candidates */
    WITH RECURSIVE found AS (
      (
        SELECT grant_row.user_id, 1 AS step
        FROM membership_grants grant_row`
  appendOrphanedQueuedGrantLookups(statement)
  statement.append(sql`
        WHERE (${cursor}::uuid IS NULL OR grant_row.user_id > ${cursor}::uuid)`)
  appendOrphanedQueuedGrantFilters(statement, userIds)
  statement.append(sql`
        ORDER BY grant_row.user_id
        LIMIT 1
      )
      UNION ALL
      SELECT next_row.user_id, found.step + 1
      FROM found
      CROSS JOIN LATERAL (
        SELECT grant_row.user_id
        FROM membership_grants grant_row`)
  appendOrphanedQueuedGrantLookups(statement)
  statement.append(sql`
        WHERE grant_row.user_id > found.user_id`)
  appendOrphanedQueuedGrantFilters(statement, userIds)
  statement.append(sql`
        ORDER BY grant_row.user_id
        LIMIT 1
      ) next_row
      WHERE found.step < ${batchSize}
    )
    SELECT found.user_id FROM found ORDER BY found.user_id`)
  const { rows } = await query<{ user_id: string }>(statement)
  return rows.map(row => row.user_id)
}

function appendOrphanedQueuedGrantLookups(statement: ReturnType<typeof sql>): void {
  statement.append(sql`
    CROSS JOIN LATERAL (
      SELECT 1 FROM memberships membership
      WHERE membership.user_id = grant_row.user_id
        AND membership.projection_ended_at IS NULL
        AND (membership.cancelled_at IS NOT NULL OR membership.expired_at IS NOT NULL)
      LIMIT 1
    ) orphan_membership
    CROSS JOIN LATERAL (
      SELECT 1 FROM membership_source_states source_state
      WHERE source_state.membership_source_id = grant_row.membership_source_id
        AND source_state.cancelled_at IS NULL
        AND source_state.expired_at IS NULL
        AND source_state.paused_at IS NULL
      LIMIT 1
    ) open_state
    CROSS JOIN LATERAL (
      SELECT 1
      WHERE NOT EXISTS (
        SELECT 1 FROM membership_grant_activation_periods activation
        WHERE activation.membership_grant_id = grant_row.id
          AND activation.user_id = grant_row.user_id
          AND activation.ended_at IS NULL
      )
    ) no_open_activation`)
}

function appendOrphanedQueuedGrantFilters(
  statement: ReturnType<typeof sql>,
  userIds?: readonly string[],
): void {
  statement.append(sql`
      AND grant_row.revoked_at IS NULL
      AND fn_membership_grant_remaining_duration(grant_row.id) >= INTERVAL '1 millisecond'`)
  if (userIds) statement.append(sql` AND grant_row.user_id = ANY(${[...userIds]}::uuid[])`)
}

async function repairOrphanedQueuedGrantUsers(userIds: readonly string[]): Promise<number> {
  let repaired = 0
  for (const userId of userIds) {
    // Each user commits alone so a lost race leaves the earlier repairs in place.
    // eslint-disable-next-line no-await-in-loop
    if (await repairOrphanedQueuedGrantUser(userId)) repaired += 1
  }
  if (repaired > 0) await enqueueDeliverMembershipEntitlementEffectsBestEffort()
  return repaired
}

async function repairOrphanedQueuedGrantUser(userId: string): Promise<boolean> {
  try {
    return await commitOrphanedQueuedGrant(userId)
  } catch (err) {
    if (isUniqueViolation(err)) return false
    throw error
  }
}

async function commitOrphanedQueuedGrant(userId: string): Promise<boolean> {
  await using query = await beginTransaction()
  // Await before this scope disposes, or the transaction rolls back mid-write.
  const recorded = await commitActivatedOrphanedGrant(userId, query)
  return recorded
}

async function commitActivatedOrphanedGrant(
  userId: string,
  query: QueryExecutor & { commit(): Promise<void> },
): Promise<boolean> {
  if (!(await recordActivatedOrphanedGrant(userId, query))) return false
  await query.commit()
  return true
}

async function recordActivatedOrphanedGrant(
  userId: string,
  query: QueryExecutor,
): Promise<boolean> {
  const change = await activateOrphanedQueuedGrant(userId, query)
  if (!change) return false
  await recordMembershipChanges([change], { query })
  return true
}
