import { write } from '@data-stores/psql'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import { isUUID } from '@modules/utils'
import {
  getRelatablePostIds,
  type PostMutationAuthority,
} from '@services/entity-relations/post-access'
import {
  isDelegatedPrivateRootDenied,
  readPostMutationAccessSnapshots,
} from '@services/entity-relations/post-mutation-snapshots'
import type { EntityRelationViewer } from '@services/entity-relations/viewer'
import assert from 'http-assert'
import sql, { type SQLStatement } from 'sql-template-strings'

export type ListablePostIds = {
  allowedIds: ReadonlySet<string>
  forbiddenIds: ReadonlySet<string>
}

/**
 * Posts the caller may place on a list. Named-scope eligibility matches relation writes.
 * A delegated credential then applies the private-root consent rule; REST passes no authority.
 * A post that is not allowed is indistinguishable from a missing post. Forbidden is only the
 * delegated private-root refusal, which is a different status.
 */
export async function filterListablePostIds(
  viewer: EntityRelationViewer,
  authority: PostMutationAuthority | null,
  postIds: readonly string[],
): Promise<ListablePostIds> {
  const uuids = [...new Set(postIds.filter(id => isUUID(id)))]
  if (uuids.length === 0) return { allowedIds: new Set(), forbiddenIds: new Set() }

  const relatable = await getRelatablePostIds(viewer, { subjectIds: [], objectIds: uuids })
  const visible = relatable.objectIds
  if (visible.size === 0 || authority?.kind !== 'delegated') {
    return { allowedIds: visible, forbiddenIds: new Set() }
  }

  const snapshots = await readPostMutationAccessSnapshots([...visible])
  const forbiddenIds = new Set<string>()
  for (const snapshot of snapshots) {
    if (isDelegatedPrivateRootDenied(authority, snapshot)) forbiddenIds.add(snapshot.id)
  }
  const allowedIds = new Set([...visible].filter(id => !forbiddenIds.has(id)))
  return { allowedIds, forbiddenIds }
}

export async function assertListablePostId(
  viewer: EntityRelationViewer,
  authority: PostMutationAuthority | null,
  postId: string,
): Promise<void> {
  const { allowedIds, forbiddenIds } = await filterListablePostIds(viewer, authority, [postId])
  assert(!forbiddenIds.has(postId), 403, 'Forbidden')
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
