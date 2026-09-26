import type { QueryExecutor, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/**
 * Serializes every mutation which can change an image's public delivery identity.  The identities
 * are deliberately shared by post attachment edits, image deletion, and copyright actions: a
 * caller must take this lock before it reads a placement revision or sends its edge transition.
 *
 * Keys are sorted before acquisition so a shared image used by several posts cannot deadlock two
 * concurrent lifecycle mutations.
 */
export function assertImageDeliveryTransaction(
  query: QueryExecutor,
): asserts query is TransactionQuery {
  if (!('client' in query))
    throw new Error('Media delivery authority requires a retained transaction')
}

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
  const { rows } = await query<{
    placement_id: string
    post_id: string | null
    image_id: string
  }>(sql`/* lockImageDeliveryMutation:findBindings */
    SELECT placement.id AS placement_id, binding.post_id, binding.image_id
    FROM (
      SELECT placement_id, post_id, image_id FROM image_placements
      UNION ALL SELECT placement_id, NULL::uuid AS post_id, image_id FROM image_surface_placements
    ) binding
    JOIN media_placements placement ON placement.id = binding.placement_id
    WHERE binding.post_id = ANY(${requestedPostIds}::uuid[])
       OR binding.image_id = ANY(${requestedImageIds}::uuid[])
       OR placement.id = ANY(${requestedPlacementIds}::uuid[])
  `)
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
  for (const key of [...keys].toSorted()) {
    // oxlint-disable-next-line no-await-in-loop -- lock order is the deadlock-prevention protocol.
    await query(sql`/* lockImageDeliveryMutation:advisory */
      SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
    `)
  }
  // All writers acquire the post/image advisory identities above before changing a binding, so
  // this row lock happens after (never before) the shared copyright placement fence.
  await query(sql`/* lockImageDeliveryMutation:lockPlacements */
    SELECT placement.id
    FROM (
      SELECT placement_id, post_id, image_id FROM image_placements
      UNION ALL SELECT placement_id, NULL::uuid AS post_id, image_id FROM image_surface_placements
    ) binding
    JOIN media_placements placement ON placement.id = binding.placement_id
    WHERE binding.post_id = ANY(${requestedPostIds}::uuid[])
       OR binding.image_id = ANY(${requestedImageIds}::uuid[])
       OR placement.id = ANY(${requestedPlacementIds}::uuid[])
    ORDER BY placement.id
    FOR UPDATE OF placement
  `)
}
