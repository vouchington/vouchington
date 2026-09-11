import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { StripeRefundScanTarget } from './refund-scan.mts'

export type StripeRefundScan = {
  completedAt: Date | null
  cursorStripeRefundId: string | null
  firstPageSeenAt: Date | null
  generation: number
  headStripeRefundId: string | null
  id: string
  nonterminalRefundSeenAt: Date | null
  reachedEndAt: Date | null
  registeredCycleGeneration: number
  verifiedCycleGeneration: number | null
}

export type StripeRefundScanCycle = {
  generation: number
  reversalCaseId: string
}

export async function getOrCreateStripeRefundScanCycle(
  reversalCaseId: string,
): Promise<StripeRefundScanCycle> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* getOrCreateStripeRefundScanCycle:insert */
    INSERT INTO membership_ineligible_purchase_reversal_refund_scan_cycles (
      membership_ineligible_purchase_reversal_case_id
    ) VALUES (${reversalCaseId}) ON CONFLICT DO NOTHING
  `)
  const { rows } = await transaction<{ completedAt: Date | null; generation: string }>(
    sql`/* getOrCreateStripeRefundScanCycle:lock */
      SELECT generation::TEXT AS generation, completed_at AS "completedAt"
      FROM membership_ineligible_purchase_reversal_refund_scan_cycles
      WHERE membership_ineligible_purchase_reversal_case_id = ${reversalCaseId}
      FOR UPDATE
    `,
  )
  const current = rows[0]
  if (!current) throw new Error('Could not create Stripe refund scan cycle')
  const generation = Number(current.generation)
  if (!Number.isSafeInteger(generation) || generation < 1)
    throw new Error('Persisted Stripe refund scan cycle generation is invalid')
  if (!current.completedAt) {
    await transaction.commit()
    return { generation, reversalCaseId }
  }
  const { rows: rotated } = await transaction<{ generation: string }>(
    sql`/* getOrCreateStripeRefundScanCycle:rotate */
      UPDATE membership_ineligible_purchase_reversal_refund_scan_cycles
      SET generation = generation + 1, completed_at = NULL
      WHERE membership_ineligible_purchase_reversal_case_id = ${reversalCaseId}
        AND generation = ${generation} AND completed_at IS NOT NULL
      RETURNING generation::TEXT AS generation
    `,
  )
  const nextGeneration = Number(rotated[0]?.generation)
  if (!Number.isSafeInteger(nextGeneration) || nextGeneration < 1)
    throw new Error('Could not rotate Stripe refund scan cycle')
  await transaction.commit()
  return { generation: nextGeneration, reversalCaseId }
}

export async function completeStripeRefundScanCycle(cycle: StripeRefundScanCycle): Promise<void> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`/* completeStripeRefundScanCycle */
    UPDATE membership_ineligible_purchase_reversal_refund_scan_cycles cycle
    SET completed_at = CURRENT_TIMESTAMP
    WHERE cycle.membership_ineligible_purchase_reversal_case_id = ${cycle.reversalCaseId}
      AND cycle.generation = ${cycle.generation} AND cycle.completed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM membership_ineligible_purchase_reversal_refund_scans scan
        WHERE scan.membership_ineligible_purchase_reversal_case_id = cycle.membership_ineligible_purchase_reversal_case_id
          AND scan.registered_cycle_generation = cycle.generation
          AND scan.verified_cycle_generation IS DISTINCT FROM cycle.generation
      )
    RETURNING cycle.membership_ineligible_purchase_reversal_case_id AS id
  `)
  if (!rows[0]) {
    const { rows: currentRows } = await transaction<{
      completedAt: Date | null
      generation: string
    }>(sql`/* completeStripeRefundScanCycle:current */
      SELECT generation::TEXT AS generation, completed_at AS "completedAt"
      FROM membership_ineligible_purchase_reversal_refund_scan_cycles
      WHERE membership_ineligible_purchase_reversal_case_id = ${cycle.reversalCaseId}
      FOR UPDATE
    `)
    const current = currentRows[0]
    if (current?.generation !== String(cycle.generation) || current.completedAt === null)
      throw new Error('Stripe refund scan cycle has an incomplete registered target')
  }
  await transaction.commit()
}

export async function getOrCreateStripeRefundScan(
  cycle: StripeRefundScanCycle,
  target: StripeRefundScanTarget,
): Promise<StripeRefundScan> {
  await using transaction = await beginTransaction()
  const scan = await getStripeRefundScanLocked(cycle.reversalCaseId, target, transaction)
  if (scan?.registeredCycleGeneration === cycle.generation) {
    await transaction.commit()
    return scan
  }
  const { rows } = await transaction<{ id: string }>(sql`/* getOrCreateStripeRefundScan:cycle */
    SELECT membership_ineligible_purchase_reversal_case_id AS id
    FROM membership_ineligible_purchase_reversal_refund_scan_cycles
    WHERE membership_ineligible_purchase_reversal_case_id = ${cycle.reversalCaseId}
      AND generation = ${cycle.generation} AND completed_at IS NULL FOR UPDATE
  `)
  if (!rows[0]) throw new Error('Stripe refund scan cycle is no longer active')
  await transaction(sql`/* getOrCreateStripeRefundScan:upsert */
    INSERT INTO membership_ineligible_purchase_reversal_refund_scans (
      membership_ineligible_purchase_reversal_case_id, invoice_id, currency_code,
      charge_id, payment_intent_id, registered_cycle_generation
    ) VALUES (
      ${cycle.reversalCaseId}, ${target.invoiceId}, ${target.currency},
      ${target.chargeId}, ${target.paymentIntentId}, ${cycle.generation}
    ) ON CONFLICT (membership_ineligible_purchase_reversal_case_id, invoice_id, currency_code,
      charge_id, payment_intent_id) DO UPDATE
    SET registered_cycle_generation = EXCLUDED.registered_cycle_generation,
      verified_cycle_generation = NULL,
      generation = CASE WHEN membership_ineligible_purchase_reversal_refund_scans.nonterminal_refund_seen_at IS NOT NULL
        THEN membership_ineligible_purchase_reversal_refund_scans.generation + 1
        ELSE membership_ineligible_purchase_reversal_refund_scans.generation END,
      head_stripe_refund_id = CASE WHEN membership_ineligible_purchase_reversal_refund_scans.nonterminal_refund_seen_at IS NOT NULL THEN NULL ELSE membership_ineligible_purchase_reversal_refund_scans.head_stripe_refund_id END,
      cursor_stripe_refund_id = CASE WHEN membership_ineligible_purchase_reversal_refund_scans.nonterminal_refund_seen_at IS NOT NULL THEN NULL ELSE membership_ineligible_purchase_reversal_refund_scans.cursor_stripe_refund_id END,
      first_page_seen_at = CASE WHEN membership_ineligible_purchase_reversal_refund_scans.nonterminal_refund_seen_at IS NOT NULL THEN NULL ELSE membership_ineligible_purchase_reversal_refund_scans.first_page_seen_at END,
      reached_end_at = CASE WHEN membership_ineligible_purchase_reversal_refund_scans.nonterminal_refund_seen_at IS NOT NULL THEN NULL ELSE membership_ineligible_purchase_reversal_refund_scans.reached_end_at END,
      nonterminal_refund_seen_at = CASE WHEN membership_ineligible_purchase_reversal_refund_scans.nonterminal_refund_seen_at IS NOT NULL THEN NULL ELSE membership_ineligible_purchase_reversal_refund_scans.nonterminal_refund_seen_at END,
      completed_at = CASE WHEN membership_ineligible_purchase_reversal_refund_scans.nonterminal_refund_seen_at IS NOT NULL THEN NULL ELSE membership_ineligible_purchase_reversal_refund_scans.completed_at END
  `)
  const registered = await getStripeRefundScanLocked(cycle.reversalCaseId, target, transaction)
  if (!registered) throw new Error('Could not create Stripe refund scan')
  await transaction.commit()
  return registered
}

export async function getStripeRefundScanLocked(
  reversalCaseId: string,
  target: StripeRefundScanTarget,
  query: QueryExecutor,
): Promise<StripeRefundScan | null> {
  const { rows } = await query<
    Omit<
      StripeRefundScan,
      'generation' | 'registeredCycleGeneration' | 'verifiedCycleGeneration'
    > & {
      generation: string
      registeredCycleGeneration: string
      verifiedCycleGeneration: string | null
    }
  >(sql`/* getStripeRefundScanLocked */
    SELECT id, generation::TEXT AS generation, head_stripe_refund_id AS "headStripeRefundId",
      cursor_stripe_refund_id AS "cursorStripeRefundId", first_page_seen_at AS "firstPageSeenAt",
      reached_end_at AS "reachedEndAt", nonterminal_refund_seen_at AS "nonterminalRefundSeenAt",
      completed_at AS "completedAt", registered_cycle_generation::TEXT AS "registeredCycleGeneration",
      verified_cycle_generation::TEXT AS "verifiedCycleGeneration"
    FROM membership_ineligible_purchase_reversal_refund_scans
    WHERE membership_ineligible_purchase_reversal_case_id = ${reversalCaseId}
      AND invoice_id = ${target.invoiceId} AND currency_code = ${target.currency}
      AND charge_id IS NOT DISTINCT FROM ${target.chargeId}
      AND payment_intent_id IS NOT DISTINCT FROM ${target.paymentIntentId} FOR UPDATE
  `)
  const row = rows[0]
  return row
    ? {
        ...row,
        generation: Number(row.generation),
        registeredCycleGeneration: Number(row.registeredCycleGeneration),
        verifiedCycleGeneration:
          row.verifiedCycleGeneration === null ? null : Number(row.verifiedCycleGeneration),
      }
    : null
}
