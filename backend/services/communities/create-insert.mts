import { writeCommunityMembershipMutation } from '@services/communities/members/write-membership'
import { registerPostCommitAction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { normalizeKey } from '@ts-shared/utils/strings'
import onError from '@modules/on-error'
import { enqueueLanguageDetection } from '@queues/content-analysis/enqueues'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { invalidate } from '@services/entity-cache/invalidate'
import {
  assertImagesReadyForSurface,
  writeImageSurfaceMutation,
} from '@services/media-delivery-safety'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '@services/media-delivery-safety/surface-mutation-bindings'
import { getCommunity, type CommunityWithOwner } from './get.mts'
import { invalidateCommunityMemberUserMetrics } from './members/invalidate-user-metrics.mts'
import type { Community } from './types.mts'
import { assertCommunityMembershipCapacity } from './membership-limits.mts'

import type { CommunityInsert } from './create-insert-types.mts'
export type { CommunityInsert } from './create-insert-types.mts'

/**
 * Inserts the community, its owner membership and its surface images in the caller's transaction.
 * Caches, the media registry and language detection follow the commit, whoever owns it.
 */
export async function insertCommunity(
  query: TransactionQuery,
  { id, slug, defaultLanguage, currentUserId, provenance, input }: CommunityInsert,
): Promise<CommunityWithOwner> {
  const imageIds = [input.profile_image_id, input.banner_image_id].flatMap(imageId =>
    imageId ? [imageId] : [],
  )
  await assertImagesReadyForSurface(imageIds, query)
  const options = { query }
  await assertCommunityMembershipCapacity(currentUserId, id, options)

  const { rows } = await writeCommunityMembershipMutation(
    sql`/* createCommunity */
    WITH new_community AS (
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
    ), owner_membership AS (
      INSERT INTO community_members (community_id, user_id, role)
      SELECT id, ${currentUserId}, 'owner' FROM new_community
    )
    SELECT id FROM new_community
    `,
    { userIds: [currentUserId], communityIds: [id] },
    options,
  )

  const newCommunity = rows[0] as Community

  if (imageIds.length) {
    await writeImageSurfaceMutation(
      query,
      [
        {
          surfaceKind: 'community-profile-image',
          communityId: newCommunity.id,
          nextImageId: input.profile_image_id ?? null,
        },
        {
          surfaceKind: 'community-banner-image',
          communityId: newCommunity.id,
          nextImageId: input.banner_image_id ?? null,
        },
      ],
      currentUserId,
      async (references, scopeQuery) => {
        const statement = imageSurfaceMutationPreimage(
          references,
          'createCommunity:setSurfaceImages',
        )
        statement.append(sql`, updated AS (
          UPDATE communities SET profile_image_id = ${input.profile_image_id ?? null},
            banner_image_id = ${input.banner_image_id ?? null}
          FROM (SELECT DISTINCT community_id FROM surface_preimage) owner_preimage
          WHERE communities.id = ${newCommunity.id} AND owner_preimage.community_id = communities.id
            AND communities.profile_image_id IS NOT DISTINCT FROM
              (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'community-profile-image')
            AND communities.banner_image_id IS NOT DISTINCT FROM
              (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'community-banner-image')
          RETURNING WITH (OLD AS prior, NEW AS current)
            prior.profile_image_id AS previous_profile_image_id,
            current.profile_image_id AS current_profile_image_id,
            prior.banner_image_id AS previous_banner_image_id,
            current.banner_image_id AS current_banner_image_id,
            (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'community-profile-image') AS previous_profile_placement_id,
            (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'community-profile-image') AS previous_profile_placement_revision,
            (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'community-profile-image') AS previous_profile_activation_revision,
            (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'community-banner-image') AS previous_banner_placement_id,
            (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'community-banner-image') AS previous_banner_placement_revision,
            (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'community-banner-image') AS previous_banner_activation_revision
        ) SELECT * FROM updated`)
        const { rows: changedRows } = await scopeQuery<{
          previous_profile_image_id: string | null
          current_profile_image_id: string | null
          previous_banner_image_id: string | null
          current_banner_image_id: string | null
          previous_profile_placement_id: string | null
          previous_profile_placement_revision: number | null
          previous_profile_activation_revision: number | null
          previous_banner_placement_id: string | null
          previous_banner_placement_revision: number | null
          previous_banner_activation_revision: number | null
        }>(statement)
        assert(changedRows.length === 1, 409, 'Community image surface changed')
        const row = changedRows[0]!
        return {
          result: undefined,
          changes: references.map((reference, index) =>
            imageSurfaceMutationChange(
              reference.surfaceKind === 'community-profile-image'
                ? {
                    ordinality: index + 1,
                    previousImageId: row.previous_profile_image_id,
                    currentImageId: row.current_profile_image_id,
                    previousPlacementId: row.previous_profile_placement_id,
                    previousPlacementRevision: row.previous_profile_placement_revision,
                    previousActivationRevision: row.previous_profile_activation_revision,
                  }
                : {
                    ordinality: index + 1,
                    previousImageId: row.previous_banner_image_id,
                    currentImageId: row.current_banner_image_id,
                    previousPlacementId: row.previous_banner_placement_id,
                    previousPlacementRevision: row.previous_banner_placement_revision,
                    previousActivationRevision: row.previous_banner_activation_revision,
                  },
            ),
          ),
        }
      },
    )
  }

  const community = await getCommunity(newCommunity.id, options)
  assert(community, 500, 'Failed to create community')
  registerPostCommitAction(query, async () => {
    void enqueueReconcileMediaDeliveryRegistry()
    void addEntityBloomKeys('communities', [
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
