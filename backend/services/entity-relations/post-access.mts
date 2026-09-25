import sql, { type SQLStatement } from 'sql-template-strings'
import { write } from '@data-stores/psql'
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
): Promise<{ subjectIds: Set<string>; objectIds: Set<string> }> {
  const [subjectIds, objectIds] = await Promise.all([
    selectAccessiblePostIds(
      posts.subjectIds,
      buildSubjectPostAccessFilter('candidate_post', 'access_post', viewer),
    ),
    selectAccessiblePostIds(
      posts.objectIds,
      buildObjectPostAccessFilter('candidate_post', 'access_post', viewer, 'named'),
    ),
  ])
  return { subjectIds, objectIds }
}

async function selectAccessiblePostIds(
  postIds: readonly string[],
  filter: SQLStatement | null,
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set()
  const query = sql`/* getRelatablePostIds */
    SELECT candidate_post.id
    FROM posts candidate_post
    JOIN posts access_post ON access_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
    WHERE candidate_post.id = ANY(${postIds}::uuid[])`
  if (filter) query.append(sql` AND `).append(filter)
  const { rows } = await write<{ id: string }>(query)
  return new Set(rows.map(row => row.id))
}
