import sql, { type SQLStatement } from 'sql-template-strings'
import type { QueryOptions } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import createHttpError from 'http-errors'
import {
  buildDirectPostEligibilityFilter,
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import { postEligibilityFor, type EntityRelationViewer } from './viewer.mts'
import {
  selectPostMutationAccess,
  type PostMutationAccess,
  type PostMutationSnapshot,
} from './post-access-visibility.mts'
import { isDelegatedPrivateRootDenied } from './post-mutation-snapshots.mts'

/**
 * Whether object posts are listed (discovery rules, like feeds) or named by id (direct rules, like
 * opening a link). A write's access check and its read-back both name objects by id.
 */
export type EntityRelationObjectPostScope = 'listed' | 'named'

/**
 * The caller's authority is explicit because an authenticated first-party request and a
 * credential-delegated request have different private-content constraints. This lower-level
 * contract is shared by relation and post mutations, avoiding an upper service dependency cycle.
 */
export type PostMutationAuthority =
  | { readonly kind: 'first_party' }
  | {
      readonly kind: 'delegated'
      readonly credentialOwnerId: string
      readonly grantedScopes: readonly string[]
    }

/**
 * A subject post is readable when the viewer passes direct eligibility or authored the post and
 * its root, so authors can relate content to their own posts while a community reviews them.
 */
export function buildSubjectPostAccessFilter(
  candidateAlias: string,
  rootAlias: string,
  viewer: EntityRelationViewer,
): SQLStatement {
  const eligibility = postEligibilityFor(viewer)
  const direct = buildDirectPostEligibilityFilter(candidateAlias, rootAlias, eligibility)
  if (eligibility.currentUserId === null) return direct
  return sql`(`
    .append(direct)
    .append(sql` OR (`)
    .append(`${candidateAlias}.created_by_id = `)
    .append(sql`${eligibility.currentUserId}::uuid AND `)
    .append(`${rootAlias}.created_by_id = `)
    .append(sql`${eligibility.currentUserId}::uuid AND `)
    .append(`${candidateAlias}.deleted_at IS NULL AND ${rootAlias}.deleted_at IS NULL`)
    .append(sql`))`)
}

/** Object post access for the viewer. */
export function buildObjectPostAccessFilter(
  candidateAlias: string,
  rootAlias: string,
  viewer: EntityRelationViewer,
  scope: EntityRelationObjectPostScope,
): SQLStatement {
  const eligibility = postEligibilityFor(viewer)
  if (scope === 'named') {
    return buildDirectPostEligibilityFilter(candidateAlias, rootAlias, eligibility)
  }
  if (viewer.kind !== 'user') return buildPublicPostEligibilityFilter(candidateAlias, rootAlias)
  return buildViewerPostDiscoveryEligibilityFilter(candidateAlias, rootAlias, {
    currentUserId: viewer.userId,
    isAdministrator: viewer.staffRole === 'administrator',
  })
}

/**
 * The subject and object posts a new relation may name, read from the primary so a post created
 * moments ago is visible. Uses the same filters as the write's read-back.
 */
export async function loadPostMutationAccess(
  viewer: EntityRelationViewer,
  posts: { readonly subjectIds: readonly string[]; readonly objectIds: readonly string[] },
  options?: QueryOptions,
  excludedObjectAccessPostTypes?: readonly string[],
): Promise<PostMutationAccess> {
  const identifiers = [...posts.subjectIds, ...posts.objectIds]
  if (identifiers.length > 0 && !identifiers.every(isUUID)) {
    throw createHttpError(404, 'Not found')
  }
  return selectPostMutationAccess(
    [
      {
        role: 'subject',
        ids: posts.subjectIds,
        filter: buildSubjectPostAccessFilter('candidate_post', 'access_post', viewer),
      },
      {
        role: 'object',
        ids: posts.objectIds,
        filter: buildObjectPostAccessFilter('candidate_post', 'access_post', viewer, 'named'),
        ...(excludedObjectAccessPostTypes?.length
          ? { excludedAccessPostTypes: excludedObjectAccessPostTypes }
          : {}),
      },
    ],
    options,
  )
}

export async function getRelatablePostIds(
  viewer: EntityRelationViewer,
  posts: { readonly subjectIds: readonly string[]; readonly objectIds: readonly string[] },
  options?: QueryOptions,
  excludedObjectAccessPostTypes?: readonly string[],
): Promise<{ subjectIds: Set<string>; objectIds: Set<string> }> {
  const access = await loadPostMutationAccess(viewer, posts, options, excludedObjectAccessPostTypes)
  return { subjectIds: access.subjectIds, objectIds: access.objectIds }
}

/**
 * Rechecks ordinary post visibility before inspecting delegated private-content ownership. Call
 * this after the canonical publication scopes are locked: a root can become private or change
 * between an initial preflight and the mutation.
 */
export async function assertPostMutationAccess(
  viewer: EntityRelationViewer,
  authority: PostMutationAuthority,
  posts: { readonly subjectIds: readonly string[]; readonly objectIds: readonly string[] },
  options?: QueryOptions,
  expectedRootIds?: ReadonlyMap<string, string>,
  loaded?: PostMutationAccess,
): Promise<Map<string, string>> {
  const access = loaded ?? (await loadPostMutationAccess(viewer, posts, options))
  assertRelatablePostIds(posts, access)
  return authorizePostMutationSnapshots(authority, [...access.snapshots.values()], expectedRootIds)
}

/** Ordinary existence/visibility preflight, deliberately separate from private diagnostics. */
export async function assertRelatablePostAccess(
  viewer: EntityRelationViewer,
  posts: { readonly subjectIds: readonly string[]; readonly objectIds: readonly string[] },
  options?: QueryOptions,
  loaded?: { subjectIds: Set<string>; objectIds: Set<string> },
): Promise<Awaited<ReturnType<typeof getRelatablePostIds>>> {
  const identifiers = [...posts.subjectIds, ...posts.objectIds]
  if (!identifiers.every(isUUID)) {
    throw createHttpError(404, 'Not found')
  }
  const relatable = loaded ?? (await getRelatablePostIds(viewer, posts, options))
  assertRelatablePostIds(posts, relatable)
  return relatable
}

function assertRelatablePostIds(
  posts: { readonly subjectIds: readonly string[]; readonly objectIds: readonly string[] },
  relatable: Awaited<ReturnType<typeof getRelatablePostIds>>,
): void {
  if (
    !posts.subjectIds.every(id => relatable.subjectIds.has(id)) ||
    !posts.objectIds.every(id => relatable.objectIds.has(id))
  ) {
    throw createHttpError(404, 'Not found')
  }
}

function authorizePostMutationSnapshots(
  authority: PostMutationAuthority,
  snapshots: readonly PostMutationSnapshot[],
  expectedRootIds?: ReadonlyMap<string, string>,
): Map<string, string> {
  if (expectedRootIds) {
    for (const snapshot of snapshots) {
      if (expectedRootIds.get(snapshot.id) !== snapshot.root_post_id) {
        throw createHttpError(404, 'Not found')
      }
    }
  }
  if (authority.kind === 'delegated') {
    for (const post of snapshots) {
      if (isDelegatedPrivateRootDenied(authority, post)) throw createHttpError(403, 'Forbidden')
    }
  }
  return new Map(snapshots.map(snapshot => [snapshot.id, snapshot.root_post_id]))
}
