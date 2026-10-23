import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Read only the landing-page claims on this test's hostname ids. */
export async function getActiveLandingPageHostnameClaims(hostnameIds: string[]): Promise<string[]> {
  const { rows } = await read<{ subject_id: string }>(sql`/* getActiveLandingPageHostnameClaims */
    SELECT relation.subject_id FROM relation__topic__landing_page__url relation
    JOIN urls ON urls.id = relation.object_id
    WHERE urls.hostname_id = ANY(${hostnameIds}::uuid[]) AND relation.deleted_at IS NULL
  `)
  return rows.map(row => row.subject_id)
}
