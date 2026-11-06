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
    /** Story-only search. Staff still need a source, and the feed may be hidden. */
    storySourceStaff?: boolean
  },
  includeStorySource = true,
): SQLStatement {
  assertSafeSqlAlias(candidateAlias)
  assertSafeSqlAlias(rootAlias)

  const nonDeleted = buildNonDeletedClause(candidateAlias, rootAlias)
  const storyStaff = options.storySourceStaff === true && includeStorySource
  if (options.isModerationStaff && !storyStaff) return nonDeleted
  if (options.isModerationStaff) {
    return sql`(`
      .append(nonDeleted)
      .append(sql` AND `)
      .append(buildStorySourceAccessClause(rootAlias, true))
      .append(sql`)`)
  }

  const candidateClearance = buildClearanceClause(candidateAlias, options.currentUserId)
  const rootClearance = buildClearanceClause(rootAlias, options.currentUserId)
  const communityAccess = buildCommunityAccessClause(
    rootAlias,
    options.currentUserId,
    options.requireActiveCommunity,
  )
  const audienceAccess = buildRootAudienceAccessClause(rootAlias, options.currentUserId)
  const statement = sql`(`
    .append(nonDeleted)
    .append(sql` AND `)
    .append(candidateClearance)
    .append(sql` AND `)
    .append(rootClearance)
    .append(sql` AND `)
    .append(communityAccess)
    .append(sql` AND `)
    .append(audienceAccess)
  if (includeStorySource) {
    statement.append(sql` AND `).append(buildStorySourceAccessClause(rootAlias, storyStaff))
  }
  return statement.append(sql`)`)
}
