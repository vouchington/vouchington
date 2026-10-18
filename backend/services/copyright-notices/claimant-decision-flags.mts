import type { TransactionQuery } from '@data-stores/psql/types'
import sql, { type SQLStatement } from 'sql-template-strings'

/** Which claimant decisions a notice already carries. */
export type CopyrightClaimantDecisionFlags = {
  already_rejected: boolean
  later_restricted: boolean
}

/**
 * The decision flags without a statement annotation, so a caller can fold them into a larger
 * statement. Read them only in a statement that starts after the notice lock: a statement that
 * waits on the lock keeps its earlier snapshot and would miss the previous holder's work items.
 */
export function copyrightClaimantDecisionFlagsSql(noticeId: string): SQLStatement {
  return sql`
    SELECT EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items
      WHERE idempotency_key IN (${`copyright-decision:${noticeId}:not_accepted:claimant`}, ${`copyright-decision:${noticeId}:not_accepted:claimant:email`})) AS already_rejected,
      EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items restricted_intent
        WHERE restricted_intent.idempotency_key IN (
          ${`copyright-decision:${noticeId}:restricted:claimant`},
          ${`copyright-decision:${noticeId}:restricted:claimant:email`}
        )) AS later_restricted
  `
}

/** The decision flags in their own statement; the caller holds the notice lock already. */
export async function selectCopyrightClaimantDecisionFlags(
  noticeId: string,
  transaction: TransactionQuery,
): Promise<CopyrightClaimantDecisionFlags> {
  const { rows } = await transaction<CopyrightClaimantDecisionFlags>(
    sql`/* selectCopyrightClaimantDecisionFlags */ `.append(
      copyrightClaimantDecisionFlagsSql(noticeId),
    ),
  )
  return rows[0]!
}

export function claimantDecisionIsOwed(
  flags: CopyrightClaimantDecisionFlags,
  event: string,
): boolean {
  return !(event === 'reversed' && flags.already_rejected && !flags.later_restricted)
}
