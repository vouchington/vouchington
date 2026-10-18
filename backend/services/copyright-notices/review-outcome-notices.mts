import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { buildCopyrightRestrictionDecisionDeliveries } from './restriction-outcome-notices.mts'
import {
  createCopyrightStatementDeliveriesInTransaction,
  type CopyrightStatementDeliveryInput,
} from './statement-delivery.mts'

export type ReviewOutcomeNoticeInput = {
  noticeId: string
  restrictionId: string
  action: 'confirm' | 'reverse'
}

export async function createCopyrightReviewOutcomeNoticesInTransaction(
  input: ReviewOutcomeNoticeInput,
  transaction: TransactionQuery,
): Promise<void> {
  await createCopyrightStatementDeliveriesInTransaction(
    await buildCopyrightReviewOutcomeDeliveries([input], transaction),
    transaction,
  )
}

/**
 * The deliveries the first human review of several restrictions of one notice owes, for a caller
 * that creates them together. Targets, facts and recipients are each read with one statement.
 */
export async function buildCopyrightReviewOutcomeDeliveries(
  inputs: readonly ReviewOutcomeNoticeInput[],
  transaction: TransactionQuery,
): Promise<CopyrightStatementDeliveryInput[]> {
  const first = inputs[0]
  if (!first) return []
  const restrictionIds = [...new Set(inputs.map(input => input.restrictionId))]
  const { rows } = await transaction<{
    id: string
    copyright_notice_target_id: string
  }>(sql`/* createCopyrightReviewOutcomeNoticesInTransaction:target */
    SELECT restriction.id, restriction.copyright_notice_target_id FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE restriction.id = ANY(${restrictionIds}::uuid[]) AND target.copyright_notice_id = ${first.noticeId}
  `)
  assert(rows.length === restrictionIds.length, 404, 'Copyright restriction not found')
  const targetIds = new Map(rows.map(row => [row.id, row.copyright_notice_target_id]))
  return buildCopyrightRestrictionDecisionDeliveries(
    inputs.map(input => ({
      ...input,
      targetId: targetIds.get(input.restrictionId)!,
      event: input.action === 'confirm' ? 'confirmed' : 'reversed',
    })),
    transaction,
  )
}
