import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type TerritorialParent = {
  jurisdiction: 'eu_dsa' | 'uk'
  decision_id: string | null
  decided_at: Date | null
}

export async function selectTerritorialParent(
  noticeId: string,
  transaction: TransactionQuery,
): Promise<TerritorialParent> {
  const { rows } =
    await transaction<TerritorialParent>(sql`/* listCopyrightTerritorialComplaints:case */
    SELECT notice.jurisdiction,
      notice.current_territorial_decision_identity_id AS decision_id,
      notice.territorial_decided_at AS decided_at
    FROM copyright_notices notice
    JOIN copyright_territorial_notice_receipts receipt
      ON receipt.copyright_notice_id = notice.id AND receipt.jurisdiction = notice.jurisdiction
    WHERE notice.id = ${noticeId} AND notice.jurisdiction IN ('eu_dsa', 'uk')`)
  assert(rows[0], 404, 'Territorial copyright notice not found')
  return rows[0]
}
