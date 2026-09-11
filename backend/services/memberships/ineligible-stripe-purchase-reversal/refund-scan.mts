import { write, type QueryExecutor } from '@data-stores/psql'
import {
  applyStripeRefundScanPage,
  getStripeRefundScanResult,
  wasSucceededStripeRefundObservedInLedger,
} from './refund-scan-ledger.mts'
import {
  completeStripeRefundScanCycle,
  getOrCreateStripeRefundScan,
  getOrCreateStripeRefundScanCycle,
  type StripeRefundScanCycle,
} from './refund-scan-cycle-ledger.mts'
import type { StripeRefund } from './refund-history.mts'

export type StripeRefundScanTarget = {
  chargeId: string | null
  currency: string
  invoiceId: string
  paymentIntentId: string | null
}

export type StripeRefundScanCallBudget = { remainingCalls: number }

export class StripeRefundScanContinuationError extends Error {
  constructor() {
    super('Stripe refund scan requires another bounded reconciliation call')
    this.name = 'StripeRefundScanContinuationError'
  }
}

export function createStripeRefundScanCallBudget(maxCalls = 10): StripeRefundScanCallBudget {
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 0)
    throw new Error('Stripe refund scan call budget must be a non-negative safe integer')
  return { remainingCalls: maxCalls }
}

export async function withStripeRefundScanCycle<T>(
  reversalCaseId: string,
  callback: (cycle: StripeRefundScanCycle) => Promise<T>,
): Promise<T> {
  assertTrimmedNonempty(reversalCaseId, 'Reversal case ID')
  const cycle = await getOrCreateStripeRefundScanCycle(reversalCaseId)
  return runStripeRefundScanCycle(cycle, callback)
}

async function runStripeRefundScanCycle<T>(
  cycle: StripeRefundScanCycle,
  callback: (cycle: StripeRefundScanCycle) => Promise<T>,
): Promise<T> {
  const result = await callback(cycle)
  await completeStripeRefundScanCycle(cycle)
  return result
}

export async function getDurableStripeRefundHistory(options: {
  callBudget: StripeRefundScanCallBudget
  listRefundsForPaymentPage: (options: {
    chargeId: string | null
    paymentIntentId: string | null
    startingAfter?: string
  }) => Promise<{
    hasMore: boolean
    nextCursor: string | undefined
    refunds: readonly StripeRefund[]
  }>
  reversalCaseId: string
  scanCycle?: StripeRefundScanCycle
  target: StripeRefundScanTarget
}): Promise<{ alreadyRefundedMinorUnits: number; refundDeferred: boolean }> {
  assertStripeRefundScanInput(options.reversalCaseId, options.target)
  if (!options.scanCycle)
    return withStripeRefundScanCycle(options.reversalCaseId, scanCycle =>
      getDurableStripeRefundHistory({ ...options, scanCycle }),
    )
  const cycle = options.scanCycle
  if (cycle.reversalCaseId !== options.reversalCaseId)
    throw new Error('Stripe refund scan cycle does not belong to the reversal case')
  const scan = await getOrCreateStripeRefundScan(cycle, options.target)
  if (options.scanCycle && scan.verifiedCycleGeneration === cycle.generation) {
    const { alreadyRefundedMinorUnits } = await getStripeRefundScanResult(scan.id)
    return {
      alreadyRefundedMinorUnits,
      refundDeferred: scan.nonterminalRefundSeenAt !== null,
    }
  }
  const mode = getScanMode(scan)
  const page = await listStripeRefundPage(
    options,
    mode === 'continue' ? scan.cursorStripeRefundId! : undefined,
  )
  const result = await applyStripeRefundScanPage({
    expected: scan,
    mode,
    page,
    cycle,
    target: options.target,
  })
  if (result === 'stale' || result === 'applied')
    return getDurableStripeRefundHistory({ ...options, scanCycle: cycle })
  const { alreadyRefundedMinorUnits } = await getStripeRefundScanResult(scan.id)
  return { alreadyRefundedMinorUnits, refundDeferred: result === 'deferred' }
}

export async function wasSucceededStripeRefundObserved(options: {
  query?: QueryExecutor
  reversalCaseId: string
  stripeRefundId: string
  target: StripeRefundScanTarget
}): Promise<boolean> {
  assertStripeRefundScanInput(options.reversalCaseId, options.target)
  assertTrimmedNonempty(options.stripeRefundId, 'Stripe refund ID')
  if (options.query)
    return wasSucceededStripeRefundObservedInLedger(
      options.reversalCaseId,
      options.target,
      options.stripeRefundId,
      options.query,
    )
  return wasSucceededStripeRefundObservedInLedger(
    options.reversalCaseId,
    options.target,
    options.stripeRefundId,
    write,
  )
}

function getScanMode(scan: {
  completedAt: Date | null
  firstPageSeenAt: Date | null
  reachedEndAt: Date | null
}): 'continue' | 'first-page' | 'verify-head' {
  if (scan.completedAt || scan.reachedEndAt) return 'verify-head'
  return scan.firstPageSeenAt ? 'continue' : 'first-page'
}

async function listStripeRefundPage(
  options: Parameters<typeof getDurableStripeRefundHistory>[0],
  startingAfter: string | undefined,
): ReturnType<Parameters<typeof getDurableStripeRefundHistory>[0]['listRefundsForPaymentPage']> {
  if (options.callBudget.remainingCalls < 1) throw new StripeRefundScanContinuationError()
  options.callBudget.remainingCalls -= 1
  return options.listRefundsForPaymentPage({
    chargeId: options.target.chargeId,
    paymentIntentId: options.target.paymentIntentId,
    ...(startingAfter ? { startingAfter } : {}),
  })
}

function assertStripeRefundScanInput(reversalCaseId: string, target: StripeRefundScanTarget): void {
  assertTrimmedNonempty(reversalCaseId, 'Reversal case ID')
  assertTrimmedNonempty(target.invoiceId, 'Stripe invoice ID')
  assertTrimmedNonempty(target.currency, 'Stripe currency')
  if (target.chargeId) assertTrimmedNonempty(target.chargeId, 'Stripe charge ID')
  if (target.paymentIntentId)
    assertTrimmedNonempty(target.paymentIntentId, 'Stripe payment intent ID')
  if (Boolean(target.chargeId) === Boolean(target.paymentIntentId))
    throw new Error('Stripe refund scan target requires exactly one payment identifier')
}

function assertTrimmedNonempty(value: string, name: string): void {
  if (!value || value !== value.trim()) throw new Error(`${name} must be nonempty and trimmed`)
}
