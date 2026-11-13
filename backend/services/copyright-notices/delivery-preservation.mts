import type { TransactionQuery } from '@data-stores/psql/types'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import sql from 'sql-template-strings'

/** Delivery updates refresh case age even when they remove pending work. */
export async function readCopyrightDeliveryPreservationCoverage(
  transaction: TransactionQuery,
  intentIds: readonly string[],
): Promise<void> {
  const { rows } = await transaction<{
    copyright_notice_id: string
  }>(sql`/* readCopyrightDeliveryPreservationCoverage */
    SELECT copyright_notice_id FROM copyright_notice_delivery_work_items
    WHERE id = ANY(${intentIds}::uuid[]) AND copyright_notice_id IS NOT NULL
  `)
  const caseIds = [...new Set(rows.map(row => row.copyright_notice_id))]
  if (caseIds.length > 0) await readCopyrightThreadRetirement(transaction, caseIds)
}
