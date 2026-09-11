import { beginTransaction, type QueryExecutor, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { StripeRefund } from './refund-history.mts'
import {
  getStripeRefundScanLocked,
  type StripeRefundScan,
  type StripeRefundScanCycle,
} from './refund-scan-cycle-ledger.mts'
import {
  insertSucceededStripeRefundObservations,
  inspectStripeRefundPage,
  type InspectedStripeRefundPage,
} from './refund-scan-observations.mts'
import type { StripeRefundScanTarget } from './refund-scan.mts'

export async function getStripeRefundScanResult(scanId: string): Promise<{
  alreadyRefundedMinorUnits: number
}> {
  const { rows } = await write<{ alreadyRefundedMinorUnits: string }>(
    sql`/* getStripeRefundScanResult */
      SELECT COALESCE(SUM(amount_minor_units), 0)::TEXT AS "alreadyRefundedMinorUnits"
      FROM membership_ineligible_purchase_reversal_refund_observations
      WHERE membership_ineligible_purchase_reversal_refund_scan_id = ${scanId}
    `,
  )
  const alreadyRefundedMinorUnits = Number(rows[0]?.alreadyRefundedMinorUnits ?? '0')
  if (!Number.isSafeInteger(alreadyRefundedMinorUnits) || alreadyRefundedMinorUnits < 0)
    throw new Error('Persisted Stripe refund total must be a non-negative safe integer')
  return { alreadyRefundedMinorUnits }
}

export async function wasSucceededStripeRefundObservedInLedger(
  reversalCaseId: string,
  target: StripeRefundScanTarget,
  stripeRefundId: string,
  query: QueryExecutor,
): Promise<boolean> {
  const { rows } = await query<{ observed: boolean }>(sql`/* wasSucceededStripeRefundObserved */
    SELECT EXISTS (
      SELECT 1
      FROM membership_ineligible_purchase_reversal_refund_scans scan
      INNER JOIN membership_ineligible_purchase_reversal_refund_observations observation
        ON observation.membership_ineligible_purchase_reversal_refund_scan_id = scan.id
      WHERE scan.membership_ineligible_purchase_reversal_case_id = ${reversalCaseId}
        AND scan.invoice_id = ${target.invoiceId} AND scan.currency_code = ${target.currency}
        AND scan.charge_id IS NOT DISTINCT FROM ${target.chargeId}
        AND scan.payment_intent_id IS NOT DISTINCT FROM ${target.paymentIntentId}
        AND observation.stripe_refund_id = ${stripeRefundId}
    ) AS observed
  `)
  return rows[0]?.observed === true
}

export async function applyStripeRefundScanPage(options: {
  expected: StripeRefundScan
  mode: 'continue' | 'first-page' | 'verify-head'
  page: {
    hasMore: boolean
    nextCursor: string | undefined
    refunds: readonly StripeRefund[]
  }
  cycle: StripeRefundScanCycle
  target: StripeRefundScanTarget
}): Promise<'applied' | 'stale' | 'completed' | 'deferred'> {
  await using transaction = await beginTransaction()
  const scan = await getStripeRefundScanLocked(
    options.cycle.reversalCaseId,
    options.target,
    transaction,
  )
  if (
    !scan ||
    scan.registeredCycleGeneration !== options.cycle.generation ||
    !scanMatchesExpected(scan, options.expected, options.mode)
  )
    return 'stale'
  const page = inspectStripeRefundPage(options.page, options.target.currency)
  await insertSucceededStripeRefundObservations(scan.id, page.succeeded, transaction)

  if (options.mode === 'verify-head') {
    if (scan.headStripeRefundId === page.headStripeRefundId) {
      if (scan.nonterminalRefundSeenAt) {
        const { rows } = await transaction<{ id: string }>(
          sql`/* applyStripeRefundScanPage:verifyDeferred */
            UPDATE membership_ineligible_purchase_reversal_refund_scans
            SET verified_cycle_generation = ${options.cycle.generation}
            WHERE id = ${scan.id} AND generation = ${scan.generation}
              AND registered_cycle_generation = ${options.cycle.generation}
            RETURNING id
          `,
        )
        if (!rows[0]) return 'stale'
        await transaction.commit()
        return 'deferred'
      }
      const { rows } = await transaction<{
        id: string
      }>(sql`/* applyStripeRefundScanPage:complete */
        UPDATE membership_ineligible_purchase_reversal_refund_scans
        SET completed_at = CURRENT_TIMESTAMP, verified_cycle_generation = ${options.cycle.generation}
        WHERE id = ${scan.id} AND generation = ${scan.generation}
          AND registered_cycle_generation = ${options.cycle.generation}
        RETURNING id
      `)
      if (!rows[0]) return 'stale'
      await transaction.commit()
      return 'completed'
    }
    await updateStripeRefundScanForPage(scan, page, true, transaction)
    await transaction.commit()
    return 'applied'
  }

  await updateStripeRefundScanForPage(scan, page, options.mode === 'first-page', transaction)
  await transaction.commit()
  return 'applied'
}

function scanMatchesExpected(
  scan: StripeRefundScan,
  expected: StripeRefundScan,
  mode: 'continue' | 'first-page' | 'verify-head',
): boolean {
  if (scan.generation !== expected.generation) return false
  if (scan.cursorStripeRefundId !== expected.cursorStripeRefundId) return false
  if (scan.headStripeRefundId !== expected.headStripeRefundId) return false
  if (mode === 'continue')
    return Boolean(scan.firstPageSeenAt && !scan.reachedEndAt && !scan.completedAt)
  if (mode === 'first-page') return !scan.firstPageSeenAt && !scan.completedAt
  return Boolean(scan.reachedEndAt)
}

async function updateStripeRefundScanForPage(
  scan: StripeRefundScan,
  page: InspectedStripeRefundPage,
  firstPage: boolean,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* updateStripeRefundScanForPage */
    UPDATE membership_ineligible_purchase_reversal_refund_scans
    SET generation = ${firstPage && scan.firstPageSeenAt ? scan.generation + 1 : scan.generation},
      head_stripe_refund_id = ${firstPage ? page.headStripeRefundId : scan.headStripeRefundId},
      cursor_stripe_refund_id = ${page.nextCursor}, first_page_seen_at = CURRENT_TIMESTAMP,
      reached_end_at = CASE WHEN ${page.hasMore} THEN NULL ELSE CURRENT_TIMESTAMP END,
      nonterminal_refund_seen_at = CASE
        WHEN ${firstPage} THEN CASE
          WHEN ${page.nonterminalRefundSeen} THEN CURRENT_TIMESTAMP
          ELSE NULL
        END
        WHEN nonterminal_refund_seen_at IS NOT NULL THEN nonterminal_refund_seen_at
        WHEN ${page.nonterminalRefundSeen} THEN CURRENT_TIMESTAMP
        ELSE NULL
      END,
      completed_at = NULL
    WHERE id = ${scan.id} AND generation = ${scan.generation}
  `)
}
