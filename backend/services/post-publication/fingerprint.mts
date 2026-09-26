import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import sql from 'sql-template-strings'
import { publicationProjectionIdentitySql } from './projection-identity.mts'

/**
 * Canonical primary-state fingerprint used by both receipt writer and operator audit.
 */
export function publicationEligibilityFingerprintSql(typed = false) {
  const statement = sql`md5(concat_ws(':', candidate.id, candidate.updated_at, root.updated_at, `
  statement.append(buildPublicPostEligibilityFilter('candidate', 'root')).append(sql`, `)
  if (!typed) statement.append(publicationProjectionIdentitySql())
  else
    statement.append(sql`candidate.post_type, candidate.created_by_id, candidate.community_id,
    candidate.parent_id, candidate.root_id, root.created_by_id, root.community_id`)
  statement.append(sql`))`)
  return statement
}
