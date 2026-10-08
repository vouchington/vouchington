import { registerPostCommitAction, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { normalizeKey } from '@ts-shared/utils/strings'
import onError from '@modules/on-error'
import { enqueueLanguageDetection } from '@queues/language-detection/enqueues'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { invalidate } from '@services/entity-cache/invalidate'
import {
  lockImageAssetAdmission,
  assertImagesReadyForSurface,
  syncImageSurfacePlacement,
} from '@services/media-delivery-safety'
import { getCommunity, type CommunityWithOwner } from './get.mts'
import { invalidateCommunityMemberUserMetrics } from './members/invalidate-user-metrics.mts'
import type { CreateCommunityInput } from './create-types.mts'
import type { Community } from './types.mts'

export type CommunityInsert = {
  id: string
  slug: string
  defaultLanguage: string | null
  currentUserId: string
  provenance: ContentProvenance
  input: CreateCommunityInput
}

/**
 * Inserts the community, its owner membership and its surface images in the caller's transaction.
 * Caches, the media registry and language detection follow the commit, whoever owns it.
 */
export async function insertCommunity(
  query: TransactionQuery,
  { id, slug, defaultLanguage, currentUserId, provenance, input }: CommunityInsert,
): Promise<CommunityWithOwner> {
  const imageIds = [input.profile_image_id, input.banner_image_id].flatMap(id => (id ? [id] : []))
  await lockImageAssetAdmission(imageIds, query)
  await assertImagesReadyForSurface(imageIds, query)
  const options = { query }

  const { rows } = await write(
    sql`/* createCommunity */
    INSERT INTO communities (
      id,
      name,
      slug,
      markdown,
      visibility,
      list_type,
      member_roster_visibility,
      member_invites_allowed_at,
      post_approval_required_at,
      should_allow_review_posts,
      should_allow_data_point_posts,
      profile_image_id,
      banner_image_id,
      created_by_id,
      default_language,
      created_via,
      created_via_oauth_client_id
    )
    VALUES (
      ${id},
      ${input.name},
      ${slug},
      ${input.markdown ?? null},
      ${input.visibility ?? 'public'},
      ${input.list_type ?? null},
      ${input.member_roster_visibility ?? 'public'},
      ${input.member_invites_allowed_at ?? null},
      ${input.post_approval_required_at ?? null},
      ${input.should_allow_review_posts ?? false},
      ${input.should_allow_data_point_posts ?? false},
      NULL,
      NULL,
      ${currentUserId},
      ${defaultLanguage},
      ${provenance.createdVia},
      ${provenance.oauthClientId}
    )
    RETURNING id
    `,
    options,
  )

  const newCommunity = rows[0] as Community

  if (input.profile_image_id) {
    await syncImageSurfacePlacement(
      { surfaceKind: 'community-profile-image', communityId: newCommunity.id },
      input.profile_image_id,
      currentUserId,
      query,
    )
  }
  if (input.banner_image_id) {
    await syncImageSurfacePlacement(
      { surfaceKind: 'community-banner-image', communityId: newCommunity.id },
      input.banner_image_id,
      currentUserId,
      query,
    )
  }
  if (imageIds.length) {
    await query(sql`/* createCommunity:setSurfaceImages */
        UPDATE communities SET profile_image_id = ${input.profile_image_id ?? null},
          banner_image_id = ${input.banner_image_id ?? null}
        WHERE id = ${newCommunity.id}
      `)
  }

  await write(
    sql`/* createCommunity */
    INSERT INTO community_members (community_id, user_id, role)
    VALUES (${newCommunity.id}, ${currentUserId}, 'owner')
    `,
    options,
  )

  const community = await getCommunity(newCommunity.id, options)
  assert(community, 500, 'Failed to create community')
  registerPostCommitAction(query, async () => {
    void enqueueReconcileMediaDeliveryRegistry()
    void entityCacheBloomFilters.communities.add([
      normalizeKey(community.id),
      normalizeKey(community.slug),
    ])
    await Promise.all([
      invalidate.communities(community),
      invalidateCommunityMemberUserMetrics(currentUserId),
    ])
    // Language detection is asynchronous enrichment; the committed community remains durable.
    void enqueueLanguageDetection('community', community.id).catch(onError)
  })
  return community
}
