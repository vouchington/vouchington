import assert from 'node:assert/strict'
import { psql } from '@data-stores/psql'
import { runWithCapturedQueries } from '@data-stores/psql/query-capture'
import { dispatchDueRefundReconciliations } from '@services/memberships/refund-reconciliation/dispatcher'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  deferMembershipRefundDispatch,
  readMembershipRefundDispatchState,
  seedMembershipRefundDispatch,
} from '../seed-data/membership-refund-dispatch.mts'

const pageSize = 100
const operation = 'dispatchDueRefundReconciliations'
const scenario = 'membership-refund-reconciliation-dispatch-at-default'

export async function runMembershipRefundDispatchScenario(): Promise<void> {
  const fixture = await seedMembershipRefundDispatch()
  try {
    registerScenarioContract(scenario, {
      seededRows: {
        membership_operations: fixture.ids.length,
        membership_operation_execution_work_items: fixture.workRows,
      },
      expectations: [
        { kind: 'queryBinds', token: 'LIMIT' },
        // The current dispatch scans both ledgers before applying the page. Tighten after #6597.
        { kind: 'maxProcessedRows', relation: 'membership_operations', max: 11_832 },
        {
          kind: 'maxProcessedRows',
          relation: 'membership_operation_execution_work_items',
          max: 9_358,
        },
        { kind: 'maxInputRows', nodeType: 'Sort', max: 101 },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const expectedIds = fixture.eligibleIds.slice(0, pageSize).toSorted()
        const expectedIdSet = new Set(expectedIds)
        const begin = psql.beginTransaction
        const leases = new Map<string, string>()
        // Observe the real writes before rolling back so both EXPLAIN modes see the same due page.
        psql.beginTransaction = async options => {
          const transaction = await begin(options)
          const { result: before } = await runWithCapturedQueries(() =>
            readMembershipRefundDispatchState(transaction, fixture.ids),
          )
          transaction.commit = async () => {
            const { result: after } = await runWithCapturedQueries(() =>
              readMembershipRefundDispatchState(transaction, fixture.ids),
            )
            assert.deepEqual(
              after.map(row => row.id),
              before.map(row => row.id),
            )
            assert.deepEqual(
              after
                .filter((row, index) => row.lease_token !== before[index]!.lease_token)
                .map(row => row.id),
              expectedIds,
            )
            for (const [index, found] of after.entries()) {
              const row = before[index]!
              if (!expectedIdSet.has(row.id)) {
                assert.deepEqual(found, row)
                continue
              }
              assert.ok(found.lease_token)
              assert.ok(found.leased_at)
              assert.ok(found.lease_expires_at)
              leases.set(row.id, found.lease_token)
              assert.deepEqual(found, {
                ...row,
                failed_at: null,
                failure_message: null,
                reconciliation_attempt_ordinal: row.reconciliation_attempt_ordinal + 1,
                lease_token: found.lease_token,
                leased_at: found.leased_at,
                lease_expires_at: found.lease_expires_at,
                lease_duration_seconds: 300,
                attempt_count: row.attempt_count! + 1,
              })
            }
            assert.equal(new Set(leases.values()).size, pageSize)
            await transaction.rollback()
          }
          return transaction
        }
        try {
          const { dispatches } = await dispatchDueRefundReconciliations()
          assert.deepEqual(
            dispatches.toSorted((left, right) => left.id.localeCompare(right.id)),
            expectedIds.map(id => ({ id, leaseToken: leases.get(id) })),
          )
        } finally {
          psql.beginTransaction = begin
        }
      },
      undefined,
      operation,
      { exactCapturedNames: [operation], useWallClock: true },
    )
  } finally {
    await deferMembershipRefundDispatch(fixture.ids)
  }
}
