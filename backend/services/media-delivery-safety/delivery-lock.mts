import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  imageDeliveryAuthorityStartedSql,
  markImageDeliveryAuthorityStarted,
} from './asset-admission-lock.mts'
import { assertImageDeliveryTransaction } from './transaction-contract.mts'

/**
 * Serializes every mutation which can change an image's public delivery identity.  The identities
 * are deliberately shared by post attachment edits, image deletion, and copyright actions: a
 * caller must take this lock before it reads a placement revision or sends its edge transition.
 *
 * Keys are sorted before acquisition so a shared image used by several posts cannot deadlock two
 * concurrent lifecycle mutations.
 */
export async function lockImageDeliveryMutation(
  query: QueryExecutor,
  input: {
    postIds?: string[]
    imageIds?: string[]
    placementIds?: string[]
    /** Exact-placement publication must not expand into another placement's shared image domain. */
    placementOnly?: boolean
  },
): Promise<void> {
  assertImageDeliveryTransaction(query)
  const requestedPostIds = [...new Set(input.postIds ?? [])]
  const requestedImageIds = [...new Set(input.imageIds ?? [])]
  const requestedPlacementIds = [...new Set(input.placementIds ?? [])]
  if (
    requestedPostIds.length === 0 &&
    requestedImageIds.length === 0 &&
    requestedPlacementIds.length === 0
  ) {
    await markImageDeliveryAuthorityStarted(query)
    return
  }
  // Constrain the parent PK explicitly: a bare join still scanned every parent in measured plans.
  const findBindings = sql`/* lockImageDeliveryMutation:findBindings */
    WITH bindings AS MATERIALIZED (`
  findBindings.append(bindingProbes(requestedPostIds, requestedImageIds, requestedPlacementIds))
  findBindings.append(sql`)
    SELECT placement.id AS placement_id, binding.post_id, binding.image_id
    FROM bindings binding
    JOIN media_placements placement ON placement.id = binding.placement_id
      AND placement.id = ANY(ARRAY(SELECT placement_id FROM bindings))`)
  const { rows } = await query<{
    placement_id: string
    post_id: string | null
    image_id: string
  }>(findBindings)
  const keys = new Set<string>()
  for (const postId of requestedPostIds) keys.add(`media-delivery:post:${postId}`)
  for (const imageId of requestedImageIds) keys.add(`media-delivery:image:${imageId}`)
  for (const placementId of requestedPlacementIds) keys.add(`image-placement:${placementId}`)
  for (const row of rows) {
    if (!input.placementOnly && row.post_id) keys.add(`media-delivery:post:${row.post_id}`)
    if (!input.placementOnly) keys.add(`media-delivery:image:${row.image_id}`)
    // Copyright actions already use this stable key.  Taking it here makes the placement
    // revision and the edge transition one serialization domain.
    keys.add(`image-placement:${row.placement_id}`)
  }
  // One statement takes every key in sorted (code-unit) order, which is the deadlock-prevention
  // protocol, and records that delivery authority has started.
  const advisory = sql`/* lockImageDeliveryMutation:advisory */
    SELECT count(pg_advisory_xact_lock(hashtextextended(key, 0))) AS locked, `
  advisory.append(imageDeliveryAuthorityStartedSql())
  advisory.append(sql` AS authority_started
    FROM (SELECT key FROM unnest(${[...keys]}::text[]) AS requested(key) ORDER BY key COLLATE "C") ordered
  `)
  await query(advisory)
  // All writers acquire the post/image advisory identities above before changing a binding, so
  // this row lock happens after (never before) the shared copyright placement fence.
  const lockPlacements = sql`/* lockImageDeliveryMutation:lockPlacements */
    WITH bindings AS MATERIALIZED (`
  lockPlacements.append(bindingProbes(requestedPostIds, requestedImageIds, requestedPlacementIds))
  lockPlacements.append(sql`)
    SELECT placement.id
    FROM bindings binding
    JOIN media_placements placement ON placement.id = binding.placement_id
      AND placement.id = ANY(ARRAY(SELECT placement_id FROM bindings))
    ORDER BY placement.id
    FOR UPDATE OF placement
  `)
  await query(lockPlacements)
}

/** Every arm starts at its own indexed binding key; UNION removes overlapping input matches. */
function bindingProbes(
  postIds: string[],
  imageIds: string[],
  placementIds: string[],
): ReturnType<typeof sql> {
  return sql`
    SELECT placement_id, post_id, image_id FROM image_placements
    WHERE post_id = ANY(${postIds}::uuid[])
    UNION
    SELECT placement_id, post_id, image_id FROM image_placements
    WHERE image_id = ANY(${imageIds}::uuid[])
    UNION
    SELECT placement_id, post_id, image_id FROM image_placements
    WHERE placement_id = ANY(${placementIds}::uuid[])
    UNION
    SELECT placement_id, NULL::uuid AS post_id, image_id FROM image_surface_placements
    WHERE image_id = ANY(${imageIds}::uuid[])
    UNION
    SELECT placement_id, NULL::uuid AS post_id, image_id FROM image_surface_placements
    WHERE placement_id = ANY(${placementIds}::uuid[])
  `
}
