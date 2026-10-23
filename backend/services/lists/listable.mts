import { write } from '@data-stores/psql'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import { isUUID } from '@modules/utils'
import {
  buildObjectPostAccessFilter,
  type PostMutationAuthority,
} from '@services/entity-relations/post-access'
import { BLOCKED_POST_TYPES } from '@voucha/types/entities/post'
import { isDelegatedPrivateRootDenied } from '@services/entity-relations/post-mutation-snapshots'
import type { EntityRelationViewer } from '@services/entity-relations/viewer'
import assert from 'http-assert'
import sql, { type SQLStatement } from 'sql-template-strings'

export type ListablePostIds = {
  allowedIds: ReadonlySet<string>
  forbiddenIds: ReadonlySet<string>
  ineligibleIds: ReadonlySet<string>
}

/**
 * A named-inaccessible post stays missing. A named-accessible post that list discovery would
 * hide is reported separately, so callers can refuse it before writing an invisible list row.
 * Both predicates and the delegated private-root snapshot come from one batch statement.
 * Delegated callers also cannot name roots of the blocked post types.
 */
export async function filterListablePostIds(
  viewer: EntityRelationViewer,
  authority: PostMutationAuthority | null,
  postIds: readonly string[],
): Promise<ListablePostIds> {
  const uuids = [...new Set(postIds.filter(id => isUUID(id)))]
  const allowedIds = new Set<string>()
  const forbiddenIds = new Set<string>()
  const ineligibleIds = new Set<string>()
  if (uuids.length === 0) return { allowedIds, forbiddenIds, ineligibleIds }

  const named = buildObjectPostAccessFilter('candidate_post', 'access_post', viewer, 'named')
  const discovery = buildObjectPostAccessFilter('candidate_post', 'access_post', viewer, 'listed')
  const query = sql`/* filterListablePostIds */
    SELECT candidate_post.id, access_post.id AS root_post_id,
      candidate_post.created_by_id AS candidate_created_by_id,
      access_post.created_by_id AS root_created_by_id,
      access_post.privacy AS root_privacy,
      `
  query.append(named ?? sql`TRUE`).append(sql` AS named_eligible, `)
  query.append(discovery ?? sql`TRUE`).append(sql` AS discovery_eligible
    FROM posts candidate_post
    JOIN posts access_post
      ON access_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
    WHERE candidate_post.id = ANY(${uuids}::uuid[])
  `)
  if (authority?.kind === 'delegated') {
    query.append(sql`AND access_post.post_type::text != ALL(${[...BLOCKED_POST_TYPES]}::text[])`)
  }
  const { rows } = await write<{
    id: string
    root_post_id: string
    candidate_created_by_id: string | null
    root_created_by_id: string | null
    root_privacy: 'public' | 'private'
    named_eligible: boolean
    discovery_eligible: boolean
  }>(query)
  for (const row of rows) {
    if (!row.named_eligible) continue
    if (authority?.kind === 'delegated' && isDelegatedPrivateRootDenied(authority, row)) {
      forbiddenIds.add(row.id)
    } else if (!row.discovery_eligible) {
      ineligibleIds.add(row.id)
    } else {
      allowedIds.add(row.id)
    }
  }
  return { allowedIds, forbiddenIds, ineligibleIds }
}

export async function assertListablePostId(
  viewer: EntityRelationViewer,
  authority: PostMutationAuthority | null,
  postId: string,
): Promise<void> {
  const { allowedIds, forbiddenIds, ineligibleIds } = await filterListablePostIds(
    viewer,
    authority,
    [postId],
  )
  assert(!forbiddenIds.has(postId), 403, 'Forbidden')
  assert(!ineligibleIds.has(postId), 422, "Post can't be added to a list")
  assert(allowedIds.has(postId), 404, 'Not found')
}

/** Discovery eligibility for a list read. Anonymous viewers get the public predicate. */
export function listPostDiscoveryFilter(
  currentUserId: string | undefined,
  isAdministrator: boolean,
): SQLStatement {
  if (!currentUserId) return buildPublicPostEligibilityFilter('candidate_post', 'root_post')
  return buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'root_post', {
    currentUserId,
    isAdministrator,
  })
}

/** Items whose row is live and that still have an enabled, non-deleted source feed. */
export async function filterListableRssFeedItemIds(
  itemIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const ids = [...new Set(itemIds.filter(id => isUUID(id)))]
  if (ids.length === 0) return new Set()
  const { rows } = await write<{ id: string }>(sql`/* filterListableRssFeedItemIds */
    SELECT rfi.id
    FROM rss_feed_items rfi
    WHERE rfi.id = ANY(${ids}::uuid[])
      AND rfi.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM rss_feed_item_sources source
        JOIN rss_feeds feed ON feed.id = source.rss_feed_id
          AND feed.deleted_at IS NULL
          AND feed.is_enabled = true
        WHERE source.rss_feed_item_id = rfi.id
      )
  `)
  return new Set(rows.map(row => row.id))
}

export async function assertListableRssFeedItemId(itemId: string): Promise<void> {
  const allowed = await filterListableRssFeedItemIds([itemId])
  assert(allowed.has(itemId), 404, 'Not found')
}
