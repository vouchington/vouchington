import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readTestCopyrightRestrictionAdministratorLift(restrictionId: string) {
  const { rows } = await read<{
    id: string
    copyright_restriction_id: string
    lifted_at: Date
    lifted_by_id: string | null
    rationale_ciphertext: string
  }>(sql`/* readTestCopyrightRestrictionAdministratorLift */
    SELECT id, copyright_restriction_id, lifted_at, lifted_by_id, rationale_ciphertext
    FROM copyright_restriction_administrator_lifts
    WHERE copyright_restriction_id = ${restrictionId}
  `)
  return rows[0] ?? null
}
