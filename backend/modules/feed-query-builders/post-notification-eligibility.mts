import sql, { type SQLStatement } from 'sql-template-strings'
import {
  assertSafeSqlAlias,
  buildCommunityAccessClause,
  buildRootAudienceAccessClause,
  buildRootDiscoveryAudienceAccessClause,
} from './post-publication-eligibility-clauses.mts'
import { buildNotificationPostEligibilityFilter } from './post-publication-eligibility.mts'

/** Combines strict publication state with the recipient's live discovery access. */
export function buildNotificationPostRecipientEligibilityFilter(
  candidateAlias: string,
  rootAlias: string,
  recipientUserId: string,
): SQLStatement {
  assertSafeSqlAlias(candidateAlias)
  assertSafeSqlAlias(rootAlias)

  return sql`(`
    .append(buildNotificationPostEligibilityFilter(candidateAlias, rootAlias))
    .append(sql` AND `)
    .append(buildRootAudienceAccessClause(rootAlias, recipientUserId))
    .append(sql` AND `)
    .append(buildRootDiscoveryAudienceAccessClause(rootAlias, recipientUserId))
    .append(sql` AND `)
    .append(buildCommunityAccessClause(rootAlias, recipientUserId, true))
    .append(sql`)`)
}
