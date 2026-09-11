import sql, { type SQLStatement } from 'sql-template-strings'
import {
  assertSafeSqlAlias,
  buildClearanceClause,
  buildCommunityAccessClause,
  buildCommunityPublicationStateClause,
  buildNonDeletedClause,
  buildRootAudienceAccessClause,
  buildRootDiscoveryAudienceAccessClause,
  buildStorySourceAccessClause,
} from './post-publication-eligibility-clauses.mts'
import { buildDiscoveryStateClause } from './post-publication-discovery-state.mts'

export type DirectPostEligibilityOptions = {
  currentUserId: string | null
  isModerationStaff: boolean
}

export type PublicPostEligibilityOptions = {
  includeArchivedCommunities?: boolean
  includeRegisteredAudience?: boolean
}

export type ViewerPostDiscoveryEligibilityOptions = {
  currentUserId: string
  includeArchivedCommunities?: boolean
  isAdministrator: boolean
}

/** Builds recipient-independent state for notification reconciliation. */
export function buildNotificationPostEligibilityFilter(
  candidateAlias: string,
  rootAlias: string,
): SQLStatement {
  assertSafeSqlAlias(candidateAlias)
  assertSafeSqlAlias(rootAlias)

  return sql`(`
    .append(buildNonDeletedClause(candidateAlias, rootAlias))
    .append(sql` AND `)
    .append(`${candidateAlias}.approved_at IS NOT NULL`)
    .append(sql` AND `)
    .append(`${rootAlias}.approved_at IS NOT NULL`)
    .append(sql` AND `)
    .append(`${candidateAlias}.openai_omni_moderation_flagged IS NOT TRUE`)
    .append(sql` AND `)
    .append(`${rootAlias}.openai_omni_moderation_flagged IS NOT TRUE`)
    .append(sql` AND `)
    .append(buildDiscoveryStateClause(candidateAlias, rootAlias))
    .append(sql` AND `)
    .append(buildCommunityPublicationStateClause(rootAlias, true))
    .append(sql` AND `)
    .append(buildStorySourceAccessClause(rootAlias))
    .append(sql`)`)
}

/**
 * Builds the anonymous publication predicate shared by discovery readers.
 */
export function buildPublicPostEligibilityFilter(
  candidateAlias: string,
  rootAlias: string,
  options?: PublicPostEligibilityOptions,
): SQLStatement {
  return buildAnonymousPostEligibilityFilter(candidateAlias, rootAlias, options, true)
}

/** Builds anonymous publication eligibility while intentionally ignoring archive state. */
export function buildOtherwisePublicPostEligibilityFilter(
  candidateAlias: string,
  rootAlias: string,
  options?: PublicPostEligibilityOptions,
): SQLStatement {
  return buildAnonymousPostEligibilityFilter(candidateAlias, rootAlias, options, false)
}

function buildAnonymousPostEligibilityFilter(
  candidateAlias: string,
  rootAlias: string,
  options: PublicPostEligibilityOptions | undefined,
  requireUnarchived: boolean,
): SQLStatement {
  assertSafeSqlAlias(candidateAlias)
  assertSafeSqlAlias(rootAlias)

  const statement = sql`(`
    .append(buildNonDeletedClause(candidateAlias, rootAlias))
    .append(sql` AND `)
    .append(`${candidateAlias}.approved_at IS NOT NULL`)
    .append(sql` AND `)
    .append(`${rootAlias}.approved_at IS NOT NULL`)
    .append(sql` AND `)
    .append(`${candidateAlias}.openai_omni_moderation_flagged IS NOT TRUE`)
    .append(sql` AND `)
    .append(`${rootAlias}.openai_omni_moderation_flagged IS NOT TRUE`)
  return statement
    .append(sql` AND `)
    .append(buildDiscoveryStateClause(candidateAlias, rootAlias, requireUnarchived))
    .append(sql` AND `)
    .append(`${rootAlias}.privacy = 'public'`)
    .append(sql` AND `)
    .append(
      options?.includeRegisteredAudience === true
        ? `${rootAlias}.broadcast IN ('everyone', 'users')`
        : `${rootAlias}.broadcast = 'everyone'`,
    )
    .append(sql` AND `)
    .append(
      buildCommunityAccessClause(rootAlias, null, options?.includeArchivedCommunities !== true),
    )
    .append(sql` AND `)
    .append(buildStorySourceAccessClause(rootAlias))
    .append(sql`)`)
}

/** Builds discovery eligibility while retaining author, audience, and staff access. */
export function buildViewerPostDiscoveryEligibilityFilter(
  candidateAlias: string,
  rootAlias: string,
  options: ViewerPostDiscoveryEligibilityOptions,
): SQLStatement {
  const directEligibility = buildPostAccessEligibilityFilter(candidateAlias, rootAlias, {
    currentUserId: options.currentUserId,
    isModerationStaff: options.isAdministrator,
    requireActiveCommunity: options.includeArchivedCommunities !== true,
  })
  const statement = sql`(`
    .append(directEligibility)
    .append(sql` AND `)
    .append(buildDiscoveryStateClause(candidateAlias, rootAlias))
  if (!options.isAdministrator) {
    statement
      .append(sql` AND `)
      .append(buildRootDiscoveryAudienceAccessClause(rootAlias, options.currentUserId))
  }
  return statement.append(sql`)`)
}

/**
 * Builds the current-state direct-reader predicate for a candidate post and its
 * access root. Callers must join `rootAlias` to COALESCE(candidate.root_id,
 * candidate.id) before composing this statement.
 *
 * Archive and suspension are intentionally not considered here: a direct link
 * remains available when its otherwise-visible content is archived or its
 * author is suspended. Discovery callers use a stricter predicate in PR 2.
 */
export function buildDirectPostEligibilityFilter(
  candidateAlias: string,
  rootAlias: string,
  options: DirectPostEligibilityOptions,
): SQLStatement {
  return buildPostAccessEligibilityFilter(candidateAlias, rootAlias, {
    ...options,
    requireActiveCommunity: false,
  })
}

function buildPostAccessEligibilityFilter(
  candidateAlias: string,
  rootAlias: string,
  options: DirectPostEligibilityOptions & { requireActiveCommunity: boolean },
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
  const storyAccess = buildStorySourceAccessClause(rootAlias)

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
    .append(storyAccess)
    .append(sql`)`)
}
