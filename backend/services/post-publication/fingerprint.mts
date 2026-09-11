import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import sql from 'sql-template-strings'
import { publicationProjectionIdentitySql } from './projection-identity.mts'

/**
 * Canonical primary-state fingerprint used by both receipt writer and operator audit.
 */
export function publicationEligibilityFingerprintSql() {
  const statement = sql`md5(concat_ws(':', candidate.id, candidate.updated_at, root.updated_at, `
  statement.append(buildPublicPostEligibilityFilter('candidate', 'root')).append(sql`, `)
  statement.append(publicationProjectionIdentitySql()).append(sql`))`)
  return statement
}
