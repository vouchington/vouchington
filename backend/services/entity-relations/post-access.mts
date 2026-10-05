import sql, { type SQLStatement } from 'sql-template-strings'
import { write, type QueryOptions } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import createHttpError from 'http-errors'
import {
  buildDirectPostEligibilityFilter,
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import { postEligibilityFor, type EntityRelationViewer } from './viewer.mts'

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
 * Returns null when the viewer bypasses post access.
 */
export function buildSubjectPostAccessFilter(
  candidateAlias: string,
  rootAlias: string,
  viewer: EntityRelationViewer,
): SQLStatement | null {
  const eligibility = postEligibilityFor(viewer)
  if (!eligibility) return null
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

/** Object post access for the viewer, or null when the viewer bypasses post access. */
export function buildObjectPostAccessFilter(
  candidateAlias: string,
  rootAlias: string,
  viewer: EntityRelationViewer,
  scope: EntityRelationObjectPostScope,
): SQLStatement | null {
  const eligibility = postEligibilityFor(viewer)
  if (!eligibility) return null
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
export async function getRelatablePostIds(
  viewer: EntityRelationViewer,
  posts: { readonly subjectIds: readonly string[]; readonly objectIds: readonly string[] },
  options?: QueryOptions,
): Promise<{ subjectIds: Set<string>; objectIds: Set<string> }> {
  const [subjectIds, objectIds] = await Promise.all([
    selectAccessiblePostIds(
      posts.subjectIds,
      buildSubjectPostAccessFilter('candidate_post', 'access_post', viewer),
      options,
    ),
    selectAccessiblePostIds(
      posts.objectIds,
      buildObjectPostAccessFilter('candidate_post', 'access_post', viewer, 'named'),
      options,
    ),
  ])
  return { subjectIds, objectIds }
}

async function selectAccessiblePostIds(
  postIds: readonly string[],
  filter: SQLStatement | null,
  options?: QueryOptions,
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set()
  const query = sql`/* getRelatablePostIds */
    SELECT candidate_post.id
    FROM posts candidate_post
    JOIN posts access_post ON access_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
    WHERE candidate_post.id = ANY(${postIds}::uuid[])`
  if (filter) query.append(sql` AND `).append(filter)
  const { rows } = await write<{ id: string }>(query, options)
  return new Set(rows.map(row => row.id))
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
): Promise<Map<string, string>> {
  await assertRelatablePostAccess(viewer, posts, options)
  const postIds = [...new Set([...posts.subjectIds, ...posts.objectIds])]
  if (postIds.length === 0) return new Map()
  const snapshots = await getPostMutationAccessSnapshots(postIds, options)
  if (expectedRootIds) {
    for (const snapshot of snapshots) {
      if (expectedRootIds.get(snapshot.id) !== snapshot.root_post_id) {
        throw createHttpError(404, 'Not found')
      }
    }
  }
  if (authority.kind === 'first_party') {
    return new Map(snapshots.map(snapshot => [snapshot.id, snapshot.root_post_id]))
  }
  for (const post of snapshots) {
    if (post.root_privacy !== 'private') continue
    if (
      !authority.grantedScopes.includes('post-relations.owned-private:write') ||
      post.candidate_created_by_id !== authority.credentialOwnerId ||
      post.root_created_by_id !== authority.credentialOwnerId
    ) {
      throw createHttpError(403, 'Forbidden')
    }
  }
  return new Map(snapshots.map(snapshot => [snapshot.id, snapshot.root_post_id]))
}

/** Ordinary existence/visibility preflight, deliberately separate from private diagnostics. */
export async function assertRelatablePostAccess(
  viewer: EntityRelationViewer,
  posts: { readonly subjectIds: readonly string[]; readonly objectIds: readonly string[] },
  options?: QueryOptions,
): Promise<void> {
  const identifiers = [...posts.subjectIds, ...posts.objectIds]
  if (!identifiers.every(isUUID)) {
    throw createHttpError(404, 'Not found')
  }
  const relatable = await getRelatablePostIds(viewer, posts, options)
  if (
    !posts.subjectIds.every(id => relatable.subjectIds.has(id)) ||
    !posts.objectIds.every(id => relatable.objectIds.has(id))
  ) {
    throw createHttpError(404, 'Not found')
  }
}

async function getPostMutationAccessSnapshots(postIds: readonly string[], options?: QueryOptions) {
  const { rows } = await write<{
    id: string
    root_post_id: string
    candidate_created_by_id: string | null
    root_created_by_id: string | null
    root_privacy: 'public' | 'private'
  }>(
    sql`/* assertPostMutationAccess */
      SELECT
        candidate_post.id,
        access_post.id AS root_post_id,
        candidate_post.created_by_id AS candidate_created_by_id,
        access_post.created_by_id AS root_created_by_id,
        access_post.privacy AS root_privacy
      FROM posts candidate_post
      JOIN posts access_post ON access_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
      WHERE candidate_post.id = ANY(${postIds}::uuid[])
    `,
    options,
  )
  if (rows.length !== postIds.length) {
    throw createHttpError(404, 'Not found')
  }
  return rows
}
