import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import {
  claimPendingMembershipEntitlementEffects,
  completeMembershipEntitlementEffects,
  type MembershipEntitlementEffect,
} from '@services/memberships/entitlement-effects'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'

const batchSize = 100
const retainedCount = 2_000
const cohortCount = 800
const claim = 'claimPendingMembershipEntitlementEffects'
const complete = 'completeMembershipEntitlementEffects'
const scenarioClaim = 'membership-entitlement-effect-claim-at-default'
const scenarioComplete = 'membership-entitlement-effect-complete-at-default'

function inspectEffects(ids: string[]) {
  return write<{
    id: string
    user_id: string
    delivery_claim_token: string | null
    delivery_claimed_at: Date | null
    delivered_at: Date | null
  }>(sql`/* inspectExplainMembershipEntitlementEffects */
    SELECT id, user_id, delivery_claim_token, delivery_claimed_at, delivered_at
    FROM membership_entitlement_effects WHERE id = ANY(${ids}::uuid[]) ORDER BY id`)
}

async function seedEffects(ids: string[], changes: string[], existingToken: string) {
  const { rowCount } = await write(sql`/* seedExplainMembershipEntitlementEffects */
    WITH fixture AS (
      SELECT id, change_id, CASE WHEN ordinality <= ${retainedCount}::int THEN 0
        ELSE 1 + (ordinality - ${retainedCount}::int - 1) % 4 END AS state
      FROM unnest(${ids}::uuid[], ${changes}::uuid[])
        WITH ORDINALITY AS input(id, change_id, ordinality)
    ), history AS (
      INSERT INTO membership_changes (id, membership_id, user_id, change_type)
      SELECT fixture.change_id, membership.id, membership.user_id, 'expiration'
      FROM fixture CROSS JOIN memberships membership WHERE membership.id = ${seedUuid(0, '31')}::uuid
      RETURNING id, user_id
    )
    INSERT INTO membership_entitlement_effects
      (id, membership_change_id, user_id, delivered_at, delivery_claim_token, delivery_claimed_at)
    SELECT fixture.id, history.id, history.user_id,
      CASE WHEN state = 0 OR state = 4 THEN NOW() - INTERVAL '1 hour' END,
      CASE WHEN state IN (2, 3) THEN ${existingToken}::text END,
      CASE state WHEN 2 THEN NOW() - INTERVAL '1 hour' WHEN 3 THEN NOW() END
    FROM fixture JOIN history ON history.id = fixture.change_id`)
  assert.equal(rowCount, ids.length)
}

async function restoreEffects(rows: Awaited<ReturnType<typeof inspectEffects>>['rows']) {
  const { rowCount } = await write(sql`/* restoreExplainMembershipEntitlementEffects */
    UPDATE membership_entitlement_effects effect SET
      delivered_at = input.delivered_at, delivery_claim_token = input.claim_token,
      delivery_claimed_at = input.claimed_at
    FROM unnest(${rows.map(row => row.id)}::uuid[], ${rows.map(row => row.delivered_at)}::timestamptz[],
      ${rows.map(row => row.delivery_claim_token)}::text[], ${rows.map(row => row.delivery_claimed_at)}::timestamptz[])
      AS input(id, delivered_at, claim_token, claimed_at)
    WHERE effect.id = input.id`)
  assert.equal(rowCount, rows.length)
}

export async function runMembershipEntitlementEffectCapacityScenarios(): Promise<void> {
  const timestamp = Date.UTC(2000, 0, 1) + randomInt(2 ** 31)
  const count = retainedCount + cohortCount
  const ids = Array.from({ length: count }, (_, index) => seedUuidAtTimestamp(timestamp, index))
  const changes = Array.from({ length: count }, (_, index) =>
    seedUuidAtTimestamp(timestamp, index + count),
  )
  const existingToken = randomUUID()
  const expectedIds = ids
    .slice(retainedCount)
    .filter((_, index) => index % 4 < 2)
    .slice(0, batchSize)
  const expected = new Set(expectedIds)
  await seedEffects(ids, changes, existingToken)
  try {
    await write(
      '/* analyzeExplainMembershipEntitlementEffects */ ANALYZE membership_entitlement_effects',
    )
    const { rows: before } = await inspectEffects(ids)
    const target = before.filter(row => expected.has(row.id))
    assert.equal(target.length, batchSize)
    let claimed: MembershipEntitlementEffect[] = []
    let claimedRows: typeof before = []
    registerScenarioContract(scenarioClaim, {
      seededRows: { membership_entitlement_effects: count },
      expectations: [
        { kind: 'queryBinds', token: 'LIMIT' },
        // Both modes scan the full target corpus. Tighten after #6596.
        { kind: 'maxProcessedRows', relation: 'membership_entitlement_effects', max: 3_049 },
        { kind: 'maxInputRows', nodeType: 'Sort', max: 0 },
      ],
    })
    await runAndCapture(
      scenarioClaim,
      async () => {
        claimed = await claimPendingMembershipEntitlementEffects()
        const token = claimed[0]?.deliveryClaimToken
        assert.ok(token && token !== existingToken)
        assert.deepEqual(
          claimed.toSorted((a, b) => a.id.localeCompare(b.id)),
          target.map(row => ({ id: row.id, userId: row.user_id, deliveryClaimToken: token })),
        )
      },
      undefined,
      claim,
      {
        exactCapturedNames: [claim],
        useWallClock: true,
        afterCapture: async () => {
          const { rows } = await inspectEffects(ids)
          assert.deepEqual(
            rows.filter(row => !expected.has(row.id)),
            before.filter(row => !expected.has(row.id)),
          )
          claimedRows = rows.filter(row => expected.has(row.id))
          assert.deepEqual(
            claimedRows.map(row => [row.id, row.delivery_claim_token, row.delivered_at]),
            expectedIds.map(id => [id, claimed[0]!.deliveryClaimToken, null]),
          )
          assert.equal(
            claimedRows.filter(row => row.delivery_claimed_at !== null).length,
            batchSize,
          )
          // Recreate the same unclaimed snapshot for both rollback-wrapped EXPLAIN modes.
          await restoreEffects(target)
        },
      },
    )
    if (claimedRows.length !== batchSize) return
    await restoreEffects(claimedRows)
    const mismatchedCount = 5
    const completions = claimed.map((row, index) =>
      index < mismatchedCount ? { ...row, deliveryClaimToken: existingToken } : row,
    )
    const completed = new Set(completions.slice(mismatchedCount).map(row => row.id))
    registerScenarioContract(scenarioComplete, {
      seededRows: { membership_entitlement_effects: count },
      expectations: [
        { kind: 'queryBinds', token: 'unnest' },
        { kind: 'maxProcessedRows', relation: 'membership_entitlement_effects', max: 245 },
        { kind: 'maxInputRows', nodeType: 'Sort', max: batchSize },
      ],
    })
    await runAndCapture(
      scenarioComplete,
      async () => {
        assert.equal(
          await completeMembershipEntitlementEffects(completions),
          batchSize - mismatchedCount,
        )
      },
      undefined,
      complete,
      {
        exactCapturedNames: [complete],
        useWallClock: true,
        afterCapture: async () => {
          const { rows } = await inspectEffects(ids)
          const completedRows = rows.filter(row => completed.has(row.id))
          assert.equal(completedRows.length, batchSize - mismatchedCount)
          assert.ok(
            completedRows.every(
              row =>
                row.delivered_at !== null &&
                row.delivery_claimed_at === null &&
                row.delivery_claim_token === null,
            ),
          )
          const claimedById = new Map(claimedRows.map(row => [row.id, row]))
          assert.deepEqual(
            rows.filter(row => !completed.has(row.id)),
            before.filter(row => !completed.has(row.id)).map(row => claimedById.get(row.id) ?? row),
          )
          // The real completion committed. Restore its leases before explaining that same batch.
          await restoreEffects(claimedRows)
        },
      },
    )
  } finally {
    const { rowCount } = await write(sql`/* cleanupExplainMembershipEntitlementEffects */
      DELETE FROM membership_entitlement_effects WHERE id = ANY(${ids}::uuid[])`)
    assert.equal(rowCount, count)
  }
}
