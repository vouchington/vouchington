import type { beginTransaction } from '@data-stores/psql'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'
type SeedTransaction = Awaited<ReturnType<typeof beginTransaction>>
type NoiseOptions = {
  pageUserId: string
  relationBaseMs: number
  communityCount: number
  itemSpacingMs: number
}

export async function seedIneligibleCollectionNoise(
  transaction: SeedTransaction,
  postIds: readonly string[],
  { pageUserId, relationBaseMs, communityCount, itemSpacingMs }: NoiseOptions,
): Promise<void> {
  // Newer memberships in other communities expose a global-id walk that skips unrelated rows.
  const noiseCommunityIds = Array.from({ length: communityCount }, (_, index) =>
    seedUuid(index, 'b9'),
  )
  const noiseMembershipIds = Array.from(
    { length: noiseCommunityIds.length * postIds.length },
    (_, index) =>
      seedUuidAtTimestamp(relationBaseMs + (postIds.length * 2 + index) * itemSpacingMs, index),
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO communities
       (id, name, slug, created_by_id, created_via)
     SELECT id, 'Ineligible page noise', 'ineligible-page-noise-' || ordinality, $2, 'system'
     FROM unnest($1::uuid[]) WITH ORDINALITY AS row(id, ordinality)
     ON CONFLICT DO NOTHING`,
    [noiseCommunityIds, pageUserId],
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO community_list_posts
       (id, community_id, post_id, added_by_id, order_index)
     SELECT membership_id, community_id, post_id, $4, post_ordinality - 1
     FROM unnest($1::uuid[]) WITH ORDINALITY AS memberships(membership_id, membership_ordinality)
     JOIN unnest($2::uuid[]) WITH ORDINALITY AS communities(community_id, community_ordinality)
       ON community_ordinality = ((membership_ordinality - 1) / $5) + 1
     JOIN unnest($3::uuid[]) WITH ORDINALITY AS posts(post_id, post_ordinality)
       ON post_ordinality = ((membership_ordinality - 1) % $5) + 1
     ON CONFLICT DO NOTHING`,
    [noiseMembershipIds, noiseCommunityIds, postIds, pageUserId, postIds.length],
  )
}
