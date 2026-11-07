import sql, { type SQLStatement } from 'sql-template-strings'
import {
  assertSafeSqlAlias,
  buildClearanceClause,
  buildCommunityAccessClause,
  buildNonDeletedClause,
  buildRootAudienceAccessClause,
  buildStorySourceAccessClause,
} from './post-publication-eligibility-clauses.mts'

export function buildPostAccessEligibilityFilter(
  candidateAlias: string,
  rootAlias: string,
  options: {
    currentUserId: string | null
    isModerationStaff: boolean
    requireActiveCommunity: boolean
  },
): SQLStatement {
  assertSafeSqlAlias(candidateAlias)
  assertSafeSqlAlias(rootAlias)

  const nonDeleted = buildNonDeletedClause(candidateAlias, rootAlias)
  if (options.isModerationStaff) return nonDeleted

  const candidateClearance = buildClearanceClause(candidateAlias, options.currentUserId)
  const rootClearance = buildClearanceClause(rootAlias, options.currentUserId)
  const communityAccess = buildCommunityAccessClause(
    rootAlias,
    options.currentUserId,
    options.requireActiveCommunity,
  )
  const audienceAccess = buildRootAudienceAccessClause(rootAlias, options.currentUserId)
  return sql`(`
    .append(nonDeleted)
    .append(sql` AND `)
    .append(candidateClearance)
    .append(sql` AND `)
    .append(rootClearance)
    .append(sql` AND `)
    .append(communityAccess)
    .append(sql` AND `)
    .append(audienceAccess)
    .append(sql` AND `)
    .append(buildStorySourceAccessClause(rootAlias))
    .append(sql`)`)
}
