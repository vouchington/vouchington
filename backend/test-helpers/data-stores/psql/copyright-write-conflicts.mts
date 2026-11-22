import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { afterPostgresTransactionQueryForTest } from '../../injected-postgres-transactions.mts'

export function failCopyrightWriteWithUnrelatedConflict(
  marker: string,
  requestValue: string,
  fixtureUserId: string,
): () => void {
  return afterPostgresTransactionQueryForTest(
    marker,
    values => values.includes(requestValue) && values.includes(fixtureUserId),
    async transaction => {
      await transaction(sql`/* failCopyrightWriteWithUnrelatedConflict */
        INSERT INTO retained_user_identities (id) VALUES (${fixtureUserId})`)
    },
  )
}

export async function readClaimantCopyrightNoticeIds(claimantId: string): Promise<string[]> {
  const { rows } = await read<{ id: string }>(sql`/* readClaimantCopyrightNoticeIds */
    SELECT id FROM copyright_notices WHERE claimant_user_id = ${claimantId}`)
  return rows.map(row => row.id)
}
