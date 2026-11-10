import { beginTransaction, isUniqueViolation, type QueryExecutor } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'
import { recordMembershipChanges } from '../changes.mts'
import { getMembershipWorkLimits } from '../work-limits.mts'
import { activateOrphanedQueuedGrant } from './repair-orphaned-queued-activate.mts'

export { activateOrphanedQueuedGrant } from './repair-orphaned-queued-activate.mts'

// Below every uuidv7, so a null cursor is still `user_id > $bound` and can use the user index.
const NIL_USER_ID = '00000000-0000-0000-0000-000000000000'

type InspectedGrantRow = {
  matched: boolean
  user_id: string
}

export async function repairOrphanedQueuedGrantsBatch(
  cursor: string | null,
  batchSize = getMembershipWorkLimits().batchSize,
  userIds?: readonly string[],
): Promise<{ repaired: number; hasMore: boolean; nextCursor: string | null }> {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new RangeError('Membership orphan repair batch size must be a positive integer')
  if (userIds && userIds.length === 0) return { repaired: 0, hasMore: false, nextCursor: cursor }
  const inspected = await readOrphanedQueuedGrantUserPage(cursor, batchSize, userIds)
  const repaired = await repairOrphanedQueuedGrantUsers(matchingUserIds(inspected))
  // The cap counts grant rows read, not matches. The next page starts after the last inspected user.
  return {
    repaired,
    hasMore: inspected.length === batchSize,
    nextCursor: inspected.at(-1)?.user_id ?? null,
  }
}

async function readOrphanedQueuedGrantUserPage(
  cursor: string | null,
  batchSize: number,
  userIds?: readonly string[],
): Promise<InspectedGrantRow[]> {
  await using query = await beginTransaction()
  const inspected = await readOrphanedQueuedGrantRows(cursor, batchSize, query, userIds)
  await query.commit()
  return inspected
}

export async function readOrphanedQueuedGrantUserIds(
  cursor: string | null,
  batchSize: number,
  query: QueryExecutor,
  userIds?: readonly string[],
): Promise<string[]> {
  const inspected = await readOrphanedQueuedGrantRows(cursor, batchSize, query, userIds)
  return matchingUserIds(inspected)
}

function matchingUserIds(rows: readonly InspectedGrantRow[]): string[] {
  const seen = new Set<string>()
  const matches: string[] = []
  for (const row of rows) {
    if (!row.matched || seen.has(row.user_id)) continue
    seen.add(row.user_id)
    matches.push(row.user_id)
  }
  return matches
}

async function readOrphanedQueuedGrantRows(
  cursor: string | null,
  batchSize: number,
  query: QueryExecutor,
  userIds?: readonly string[],
): Promise<InspectedGrantRow[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new RangeError('Membership orphan repair batch size must be a positive integer')
  const bound = cursor ?? NIL_USER_ID
  // One user can hold many grants, so this walk is not one row per user. DISTINCT ON would
  // keep reading until it filled the cap with users. The limit below is the rows inspected.
  const statement = sql`/* repairOrphanedQueuedGrantsBatch: candidates */
    SELECT inspected.user_id,
           (
             inspected.revoked_at IS NULL
             AND EXISTS (
               SELECT 1 FROM memberships membership
               WHERE membership.user_id = inspected.user_id
                 AND membership.projection_ended_at IS NULL
                 AND (membership.cancelled_at IS NOT NULL OR membership.expired_at IS NOT NULL)
             )
             AND EXISTS (
               SELECT 1 FROM membership_source_states source_state
               WHERE source_state.membership_source_id = inspected.membership_source_id
                 AND source_state.cancelled_at IS NULL
                 AND source_state.expired_at IS NULL
                 AND source_state.paused_at IS NULL
             )
             AND NOT EXISTS (
               SELECT 1 FROM membership_grant_activation_periods activation
               WHERE activation.membership_grant_id = inspected.id
                 AND activation.user_id = inspected.user_id
                 AND activation.ended_at IS NULL
             )
             AND fn_membership_grant_remaining_duration(inspected.id) >= INTERVAL '1 millisecond'
           ) AS matched
    FROM (
      SELECT grant_row.id, grant_row.user_id, grant_row.membership_source_id, grant_row.revoked_at
      FROM membership_grants grant_row
      WHERE grant_row.user_id > ${bound}::uuid`
  if (userIds) statement.append(sql` AND grant_row.user_id = ANY(${[...userIds]}::uuid[])`)
  statement.append(`
      ORDER BY grant_row.user_id, grant_row.id
      LIMIT `)
  // batchSize is a validated DynamicConfig integer.
  statement.append(batchSize)
  statement.append(`
    ) inspected
    ORDER BY inspected.user_id, inspected.id`)
  const { rows } = await query<InspectedGrantRow>(statement)
  return rows
}

async function repairOrphanedQueuedGrantUsers(userIds: readonly string[]): Promise<number> {
  let repaired = 0
  for (const userId of userIds) {
    // no-mistakes-disable-next-line query-reached-per-item: one transaction per user in this capped page; a unique-index race must not undo earlier repairs
    if (await repairOrphanedQueuedGrantUser(userId)) repaired += 1 // oxlint-disable-line no-await-in-loop -- each user commits alone
  }
  if (repaired > 0) await enqueueDeliverMembershipEntitlementEffectsBestEffort()
  return repaired
}

async function repairOrphanedQueuedGrantUser(userId: string): Promise<boolean> {
  try {
    return await commitOrphanedQueuedGrant(userId)
  } catch (err) {
    if (isUniqueViolation(err)) return false
    throw err
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
