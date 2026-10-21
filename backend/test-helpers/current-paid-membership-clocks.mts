import { beginTransaction, read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCurrentPaidMemberships } from './data-stores/psql/current-paid-memberships.mts'
import { createLocalTestUser } from './data-stores/psql/users.mts'
import { createTestFamilyMembership } from './entities/memberships/family.mts'
import type { createTestSku } from './entities/memberships.mts'

export type FamilyMembershipClockFixture = { membershipId: string; userId: string }
export type FamilyMembershipClockOffsets = {
  membershipExpiry: number
  sourceExpiry: number
  sourceEffective: number
}
type ClockState = {
  membership_id: string
  membership_source_id: string
  user_id: string
  membership_expires_at: Date | null
  source_expires_at: Date | null
  source_effective_at: Date
}
type NativeClock = { backend_pid: number; decision_at: string }

export async function createTestIndependentFamilyClockFixture(
  sku: Awaited<ReturnType<typeof createTestSku>>,
): Promise<FamilyMembershipClockFixture> {
  const user = await createLocalTestUser()
  const membership = await createTestFamilyMembership({
    applicationId: sku.provider_application_id,
    expiresAt: null,
    membershipProductId: sku.id,
    membershipProviderProductId: sku.membership_provider_product_id,
    userId: user.id,
  })
  return { membershipId: membership.id, userId: user.id }
}

export async function readTestIndependentFamilyMembershipClocks(
  target: FamilyMembershipClockFixture,
  control: FamilyMembershipClockFixture,
  offsets: FamilyMembershipClockOffsets,
) {
  if (!Object.values(offsets).every(Number.isSafeInteger))
    throw new RangeError('Membership clock offsets must be safe integer milliseconds')
  const [targetBefore, controlBefore] = await Promise.all([readState(target), readState(control)])
  const observation = await observeClocks(target, control, offsets, { targetBefore, controlBefore })
  const [targetAfterRollback, controlAfterRollback] = await Promise.all([
    readState(target),
    readState(control),
  ])
  return { ...observation, targetAfterRollback, controlAfterRollback }
}

async function observeClocks(
  target: FamilyMembershipClockFixture,
  control: FamilyMembershipClockFixture,
  offsets: FamilyMembershipClockOffsets,
  original: { targetBefore: ClockState; controlBefore: ClockState },
) {
  await using query = await beginTransaction()
  const userIds = [target.userId, control.userId]
  const paidBefore = await getCurrentPaidMemberships(userIds, { query })
  const clockBefore = await readClock(query)
  const changedMembership = await query(sql`/* setTestIndependentMembershipExpiry */
    UPDATE memberships
    SET expires_at = CURRENT_TIMESTAMP + ${offsets.membershipExpiry}::double precision * INTERVAL '1 millisecond'
    WHERE id = ${target.membershipId} AND user_id = ${target.userId}`)
  if (changedMembership.rowCount !== 1) throw new Error('Expected one owned membership')
  const changedSource = await query(sql`/* setTestIndependentFamilySourceClocks */
    UPDATE membership_source_states state
    SET expires_at = CURRENT_TIMESTAMP + ${offsets.sourceExpiry}::double precision * INTERVAL '1 millisecond',
        effective_at = CURRENT_TIMESTAMP + ${offsets.sourceEffective}::double precision * INTERVAL '1 millisecond'
    FROM memberships membership
    WHERE membership.id = ${target.membershipId} AND membership.user_id = ${target.userId}
      AND state.membership_source_id = membership.membership_source_id
      AND state.source_kind = 'family'`)
  if (changedSource.rowCount !== 1) throw new Error('Expected one owned family source')
  const { rows: storedOffsets } = await query<FamilyMembershipClockOffsets>(
    sql`/* readTestIndependentFamilyClockOffsets */
      SELECT
        (EXTRACT(EPOCH FROM (membership.expires_at - CURRENT_TIMESTAMP)) * 1000)::integer AS "membershipExpiry",
        (EXTRACT(EPOCH FROM (state.expires_at - CURRENT_TIMESTAMP)) * 1000)::integer AS "sourceExpiry",
        (EXTRACT(EPOCH FROM (state.effective_at - CURRENT_TIMESTAMP)) * 1000)::integer AS "sourceEffective"
      FROM memberships membership
      JOIN membership_source_states state ON state.membership_source_id = membership.membership_source_id
      WHERE membership.id = ${target.membershipId} AND membership.user_id = ${target.userId}`,
  )
  const paid = await getCurrentPaidMemberships(userIds, { query })
  const { rows: privateUsers } = await query<{ id: string; membership_plan: string | null }>(
    sql`/* readTestIndependentFamilyPrivateUsers */
      SELECT id, membership_plan FROM view_users_private WHERE id = ANY(${userIds}) ORDER BY id`,
  )
  const controlDuring = await readState(control, query)
  const clockAfter = await readClock(query)
  if (!storedOffsets[0]) throw new Error('Expected persisted owned clock offsets')
  return {
    ...original,
    paidBefore,
    paid,
    privateUsers,
    storedOffsets: storedOffsets[0],
    controlDuring,
    clockBefore,
    clockAfter,
  }
}

async function readState(fixture: FamilyMembershipClockFixture, query?: QueryExecutor) {
  const statement = sql`/* readTestFamilyMembershipClockState */
    SELECT membership.id AS membership_id, membership.membership_source_id, membership.user_id,
      membership.expires_at AS membership_expires_at,
      state.expires_at AS source_expires_at, state.effective_at AS source_effective_at
    FROM memberships membership
    JOIN membership_source_states state ON state.membership_source_id = membership.membership_source_id
    WHERE membership.id = ${fixture.membershipId} AND membership.user_id = ${fixture.userId}`
  const result = query ? await query<ClockState>(statement) : await read<ClockState>(statement)
  const row = result.rows[0]
  if (!row) throw new Error('Expected an owned family membership clock state')
  return row
}

async function readClock(query: QueryExecutor): Promise<NativeClock> {
  const { rows } = await query<NativeClock>(sql`/* readTestFamilyMembershipTransactionClock */
    SELECT pg_backend_pid() AS backend_pid, CURRENT_TIMESTAMP::text AS decision_at`)
  if (!rows[0]) throw new Error('Expected the native membership transaction clock')
  return rows[0]
}
