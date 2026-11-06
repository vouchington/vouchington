import sql, { type SQLStatement } from 'sql-template-strings'
import {
  assertSafeSqlAlias,
  buildCommunityAccessClause,
  buildCommunityPublicationStateClause,
  buildNonDeletedClause,
  buildRootDiscoveryAudienceAccessClause,
  buildStorySourceAccessClause,
} from './post-publication-eligibility-clauses.mts'
import { buildPostAccessEligibilityFilter } from './post-publication-access.mts'
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
  storySourceStaff?: boolean
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
  includeStorySource = true,
): SQLStatement {
  assertSafeSqlAlias(candidateAlias)
  assertSafeSqlAlias(rootAlias)

  const statement = sql`(`
    .append(buildNonDeletedClause(candidateAlias, rootAlias))
    .append(sql` AND `)
    .append(`${candidateAlias}.approved_at IS NOT NULL`)
    .append(sql` AND `)
    .append(`${rootAlias}.approved_at IS NOT NULL`)
  statement
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
  if (includeStorySource) {
    statement.append(sql` AND `).append(buildStorySourceAccessClause(rootAlias))
  }
  return statement.append(sql`)`)
}

/**
 * Eligibility for a page that already read a live discoverable source, or that
 * only reads non-story posts. The story-source EXISTS reads RSS state through
 * `view_rss_feed_current_states`; keeping it here would scan that view per child.
 */
export function buildSourceBoundPostEligibilityFilter(
  candidateAlias: string,
  rootAlias: string,
  viewer: { currentUserId: string; isAdministrator: boolean } | null,
): SQLStatement {
  if (!viewer) {
    return buildAnonymousPostEligibilityFilter(candidateAlias, rootAlias, undefined, true, false)
  }
  const directEligibility = buildPostAccessEligibilityFilter(
    candidateAlias,
    rootAlias,
    {
      currentUserId: viewer.currentUserId,
      isModerationStaff: viewer.isAdministrator,
      requireActiveCommunity: true,
    },
    false,
  )
  const statement = sql`(`
    .append(directEligibility)
    .append(sql` AND `)
    .append(buildDiscoveryStateClause(candidateAlias, rootAlias))
  if (!viewer.isAdministrator) {
    statement
      .append(sql` AND `)
      .append(buildRootDiscoveryAudienceAccessClause(rootAlias, viewer.currentUserId))
  }
  return statement.append(sql`)`)
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
    storySourceStaff: options.storySourceStaff,
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
 * access root. Callers must join `rootAlias` to COALESCE(candidate.root_post_id,
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
