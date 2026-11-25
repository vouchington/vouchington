import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { runAfterPostgresWriteForTest } from '../../../test-helpers/injected-failures.mts'
import { createRefundScanCase } from '../../../test-helpers/services/memberships/refund-scan-case.mts'
import { getRefundableReversalTargets } from '../ineligible-stripe-purchase-reversal-targets.mts'
import {
  completeStripeRefundScanCycle,
  getOrCreateStripeRefundScan,
  getOrCreateStripeRefundScanCycle,
} from './refund-scan-cycle-ledger.mts'
import { applyStripeRefundScanPage } from './refund-scan-ledger.mts'
import {
  createStripeRefundScanCallBudget,
  getDurableStripeRefundHistory,
  withStripeRefundScanCycle,
} from './refund-scan.mts'

describe('durable Stripe refund scan hardening', () => {
  it('joins the first cycle when a peer creates it during admission', async () => {
    const fixture = await createRefundScanCase()
    const expected = { generation: 1, reversalCaseId: fixture.reversalCaseId }
    let peerStarted = false
    onTestFinished(
      runAfterPostgresWriteForTest(async (statement, values, result) => {
        if (
          peerStarted ||
          !values.includes(fixture.reversalCaseId) ||
          !statement.includes('getOrCreateStripeRefundScanCycle:read') ||
          result.rows.length !== 0
        )
          return
        peerStarted = true
        await expect(getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)).resolves.toEqual(
          expected,
        )
      }),
    )

    await expect(getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)).resolves.toEqual(
      expected,
    )
    expect(peerStarted).toBe(true)
  })

  it('allows concurrent workers to complete the same verified cycle', async () => {
    const fixture = await createRefundScanCase()
    const cycle = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)

    await expect(
      Promise.all([completeStripeRefundScanCycle(cycle), completeStripeRefundScanCycle(cycle)]),
    ).resolves.toEqual([undefined, undefined])
  })

  it('admits a worker to the verified generation when a peer completes it during admission', async () => {
    const fixture = await createRefundScanCase()
    const cycle = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
    const scanOptions = {
      reversalCaseId: fixture.reversalCaseId,
      target: fixture.target,
      listRefundsForPaymentPage: async () => ({
        refunds: [{ amount: 500, currency: 'usd', id: fixture.firstRefundId, status: 'succeeded' }],
        hasMore: false,
        nextCursor: undefined,
      }),
    }
    const expected = { alreadyRefundedMinorUnits: 500, refundDeferred: false }
    await expect(
      getDurableStripeRefundHistory({
        ...scanOptions,
        callBudget: createStripeRefundScanCallBudget(2),
        scanCycle: cycle,
      }),
    ).resolves.toEqual(expected)

    let completed = false
    onTestFinished(
      runAfterPostgresWriteForTest(async (statement, values) => {
        if (completed || !values.includes(fixture.reversalCaseId)) return
        if (
          !statement.includes('getOrCreateStripeRefundScanCycle:read') &&
          !statement.includes('getOrCreateStripeRefundScanCycle:rotate')
        )
          return
        await completeStripeRefundScanCycle(cycle)
        completed = true
      }),
    )

    const joined = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
    expect(completed).toBe(true)
    expect(joined).toEqual(cycle)
    await expect(
      getDurableStripeRefundHistory({
        ...scanOptions,
        callBudget: createStripeRefundScanCallBudget(0),
        scanCycle: joined,
      }),
    ).resolves.toEqual(expected)
  })

  it('rotates a completed cycle once and returns the same open generation after', async () => {
    const fixture = await createRefundScanCase()
    const completed = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
    await completeStripeRefundScanCycle(completed)

    const rotated = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
    const joined = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)

    expect(rotated).toEqual({
      generation: completed.generation + 1,
      reversalCaseId: fixture.reversalCaseId,
    })
    expect(joined).toEqual(rotated)
  })

  it('rotates a completed cycle once for concurrent workers', async () => {
    const fixture = await createRefundScanCase()
    const completed = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
    await completeStripeRefundScanCycle(completed)

    const cycles = await Promise.all([
      getOrCreateStripeRefundScanCycle(fixture.reversalCaseId),
      getOrCreateStripeRefundScanCycle(fixture.reversalCaseId),
    ])

    const expected = {
      generation: completed.generation + 1,
      reversalCaseId: fixture.reversalCaseId,
    }
    expect(cycles).toEqual([expected, expected])
  })

  it('joins the winning generation when a peer rotates and completes it during admission', async () => {
    const fixture = await createRefundScanCase()
    const completed = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
    await completeStripeRefundScanCycle(completed)

    const expected = {
      generation: completed.generation + 1,
      reversalCaseId: fixture.reversalCaseId,
    }
    let peerStarted = false
    onTestFinished(
      runAfterPostgresWriteForTest(async (statement, values) => {
        if (
          peerStarted ||
          !values.includes(fixture.reversalCaseId) ||
          !statement.includes('getOrCreateStripeRefundScanCycle:read')
        )
          return
        peerStarted = true
        const winner = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
        expect(winner).toEqual(expected)
        await completeStripeRefundScanCycle(winner)
      }),
    )

    await expect(getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)).resolves.toEqual(
      expected,
    )
    expect(peerStarted).toBe(true)
  })

  it('refuses to register a scan against a cycle generation that has been rotated', async () => {
    const fixture = await createRefundScanCase()
    const oldCycle = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
    await completeStripeRefundScanCycle(oldCycle)
    const newCycle = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)

    await expect(getOrCreateStripeRefundScan(oldCycle, fixture.target)).rejects.toThrow(
      'no longer active',
    )

    const scan = await getOrCreateStripeRefundScan(newCycle, fixture.target)
    expect(newCycle.generation).toBe(oldCycle.generation + 1)
    expect(scan.registeredCycleGeneration).toBe(newCycle.generation)
  })

  it('refuses to complete a cycle with an unverified registered target', async () => {
    const fixture = await createRefundScanCase()
    const cycle = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
    await getOrCreateStripeRefundScan(cycle, fixture.target)

    await expect(completeStripeRefundScanCycle(cycle)).rejects.toThrow(
      'Stripe refund scan cycle has an incomplete registered target',
    )
  })

  it('rejects a scan cycle owned by another reversal case', async () => {
    const fixture = await createRefundScanCase()

    await expect(
      getDurableStripeRefundHistory({
        callBudget: createStripeRefundScanCallBudget(),
        listRefundsForPaymentPage: async () => ({
          refunds: [],
          hasMore: false,
          nextCursor: undefined,
        }),
        reversalCaseId: fixture.reversalCaseId,
        scanCycle: { generation: 1, reversalCaseId: randomUUID() },
        target: fixture.target,
      }),
    ).rejects.toThrow('Stripe refund scan cycle does not belong to the reversal case')
  })

  it('rejects a page committed for a stale cycle generation', async () => {
    const fixture = await createRefundScanCase()
    const cycle = await getOrCreateStripeRefundScanCycle(fixture.reversalCaseId)
    const scan = await getOrCreateStripeRefundScan(cycle, fixture.target)

    await expect(
      applyStripeRefundScanPage({
        cycle: { ...cycle, generation: cycle.generation + 1 },
        expected: scan,
        mode: 'first-page',
        page: { refunds: [], hasMore: false, nextCursor: undefined },
        target: fixture.target,
      }),
    ).resolves.toBe('stale')
  })

  it('freshly scans a pending target when the next verification cycle sees it succeed', async () => {
    const fixture = await createRefundScanCase()
    const reconcile = (status: 'pending' | 'succeeded') =>
      withStripeRefundScanCycle(fixture.reversalCaseId, scanCycle =>
        getDurableStripeRefundHistory({
          callBudget: createStripeRefundScanCallBudget(2),
          listRefundsForPaymentPage: async () => ({
            refunds: [{ amount: 500, currency: 'usd', id: fixture.firstRefundId, status }],
            hasMore: false,
            nextCursor: undefined,
          }),
          reversalCaseId: fixture.reversalCaseId,
          scanCycle,
          target: fixture.target,
        }),
      )

    await expect(reconcile('pending')).resolves.toEqual({
      alreadyRefundedMinorUnits: 0,
      refundDeferred: true,
    })
    await expect(reconcile('succeeded')).resolves.toEqual({
      alreadyRefundedMinorUnits: 500,
      refundDeferred: false,
    })
  })

  it('finishes more than ten lazily registered targets across retries, then re-verifies them in a new cycle', async () => {
    const fixture = await createRefundScanCase()
    const invoices = [
      {
        created: 1_893_456_000,
        currency: 'usd',
        id: fixture.target.invoiceId,
        payments: {
          data: Array.from({ length: 11 }, (_, index) => ({
            amount_paid: 100,
            payment: { type: 'charge' as const, charge: `ch_refund_scan_many_${index}` },
          })),
        },
        status: 'paid' as const,
      },
    ]
    const calls: string[] = []
    const reconcile = (budget: number) =>
      withStripeRefundScanCycle(fixture.reversalCaseId, async scanCycle => {
        const callBudget = createStripeRefundScanCallBudget(budget)
        return getRefundableReversalTargets(
          invoices,
          target =>
            getDurableStripeRefundHistory({
              callBudget,
              listRefundsForPaymentPage: async () => {
                calls.push(target.chargeId!)
                return { refunds: [], hasMore: false, nextCursor: undefined }
              },
              reversalCaseId: fixture.reversalCaseId,
              scanCycle,
              target,
            }),
          async () => ({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
        )
      })

    await expect(reconcile(10)).rejects.toThrow(
      'Stripe refund scan requires another bounded reconciliation call',
    )
    await expect(reconcile(10)).rejects.toThrow(
      'Stripe refund scan requires another bounded reconciliation call',
    )
    await expect(reconcile(10)).resolves.toHaveLength(11)
    expect(new Set(calls)).toHaveLength(11)
    expect(calls).toHaveLength(22)
    await expect(reconcile(22)).resolves.toHaveLength(11)
    expect(calls).toHaveLength(33)
  })
})
