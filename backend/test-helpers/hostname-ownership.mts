import { read, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Match the first existing ancestor key acquired by the real hostname ownership statement. */
export async function getFirstTestHostnameOwnershipLockKey(
  query: TransactionQuery,
  hostnameId: string,
): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`/* getFirstTestHostnameOwnershipLockKey */
    WITH RECURSIVE hostname_names(hostname) AS (
      SELECT hostname FROM url_hostnames WHERE id = ${hostnameId}::uuid
      UNION
      SELECT substring(hostname FROM position('.' IN hostname) + 1)
      FROM hostname_names WHERE position('.' IN hostname) > 0
    )
    SELECT id FROM url_hostnames
    WHERE hostname IN (SELECT hostname FROM hostname_names)
    ORDER BY id LIMIT 1
  `)
  if (!rows[0]) throw new Error('Hostname ownership lock fixture has no existing hostname key')
  return rows[0].id
}

/** Read only the landing-page claims on this test's hostname ids. */
export async function getActiveLandingPageHostnameClaims(hostnameIds: string[]): Promise<string[]> {
  const { rows } = await read<{ subject_id: string }>(sql`/* getActiveLandingPageHostnameClaims */
    SELECT relation.subject_id FROM relation__topic__landing_page__url relation
    JOIN urls ON urls.id = relation.object_id
    WHERE urls.hostname_id = ANY(${hostnameIds}::uuid[]) AND relation.deleted_at IS NULL
  `)
  return rows.map(row => row.subject_id)
}
