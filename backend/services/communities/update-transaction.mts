import type { TransactionQuery } from '@data-stores/psql/types'
import {
  writeImageSurfaceMutation,
  type ImageSurfaceReference,
} from '@services/media-delivery-safety'
import assert from 'http-assert'
import { recordPostPublicationChange } from '@services/post-publication'
import type { CommunityWithOwner } from './get.mts'
import { mapCommunityWithOwner, type CommunityRowWithOwner } from './get-mapping.mts'
import type { UpdateCommunityInput } from './update-types.mts'
import type { CommunityVisibility } from './types.mts'
import {
  imageSurfaceMutationChange,
  type ImageSurfaceMutationWrite,
} from '@services/media-delivery-safety/surface-mutation-bindings'
import type { SQLStatement } from 'sql-template-strings'

export async function updateCommunityInTransaction(input: {
  community: CommunityWithOwner
  communityId: string
  actorUserId: string
  update: UpdateCommunityInput
  statement: (references: readonly ImageSurfaceReference[]) => SQLStatement
  query: TransactionQuery
}): Promise<{
  prior: { visibility: CommunityVisibility; slug: string } | null
  updated: CommunityWithOwner | null
}> {
  const { locked, updated } = await applyLockedCommunityUpdate(input)
  if (updated && locked && publicationChanged(input.update, locked)) {
    await recordPostPublicationChange(input.query, {
      scope: { type: 'community', communityId: input.communityId },
      reason: 'community_visibility_changed',
      impactedCommunityIds: [input.communityId],
      footprint: { priorCommunityId: input.communityId, priorCommunitySlug: locked.slug },
    })
  }
  return { prior: updated ? locked : null, updated }
}

async function applyLockedCommunityUpdate(
  input: Parameters<typeof updateCommunityInTransaction>[0],
) {
  const surfaces = changedCommunitySurfaces(input)
  const locked = await lockCommunityPublicationInputs(input.query, input.communityId)
  const updated = await writeImageSurfaceMutation(
    input.query,
    surfaces,
    input.actorUserId,
    (references, scopeQuery) => writeCommunityOwner({ ...input, query: scopeQuery }, references),
  )
  return { locked, updated }
}

async function writeCommunityOwner(
  input: Parameters<typeof updateCommunityInTransaction>[0],
  references: readonly ImageSurfaceReference[],
): Promise<ImageSurfaceMutationWrite<CommunityWithOwner | null>> {
  const statement = input.statement(references)
  const { rows } = await input.query<
    CommunityRowWithOwner & {
      previous_profile_image_id?: string | null
      current_profile_image_id?: string | null
      previous_banner_image_id?: string | null
      current_banner_image_id?: string | null
      previous_profile_placement_id?: string | null
      previous_profile_placement_revision?: number | null
      previous_profile_activation_revision?: number | null
      previous_banner_placement_id?: string | null
      previous_banner_placement_revision?: number | null
      previous_banner_activation_revision?: number | null
    }
  >(statement.text, statement.values)
  if (references.length) assert(rows.length === 1, 409, 'Community or image surface changed')
  const row = rows[0]
  return {
    result: row ? mapCommunityWithOwner(row) : null,
    changes: references.map((reference, index) =>
      imageSurfaceMutationChange(
        reference.surfaceKind === 'community-profile-image'
          ? {
              ordinality: index + 1,
              previousImageId: row?.previous_profile_image_id ?? null,
              currentImageId: row?.current_profile_image_id ?? null,
              previousPlacementId: row?.previous_profile_placement_id ?? null,
              previousPlacementRevision: row?.previous_profile_placement_revision ?? null,
              previousActivationRevision: row?.previous_profile_activation_revision ?? null,
            }
          : {
              ordinality: index + 1,
              previousImageId: row?.previous_banner_image_id ?? null,
              currentImageId: row?.current_banner_image_id ?? null,
              previousPlacementId: row?.previous_banner_placement_id ?? null,
              previousPlacementRevision: row?.previous_banner_placement_revision ?? null,
              previousActivationRevision: row?.previous_banner_activation_revision ?? null,
            },
      ),
    ),
  }
}

async function lockCommunityPublicationInputs(
  query: TransactionQuery,
  communityId: string,
): Promise<{ visibility: CommunityVisibility; slug: string } | null> {
  const { rows } = await query<{ visibility: CommunityVisibility; slug: string }>(
    `/* updateCommunity:lockPublicationInputs */
    SELECT visibility, slug FROM communities WHERE id = $1 AND deleted_at IS NULL`,
    [communityId],
  )
  return rows[0] ?? null
}

function changedCommunitySurfaces(input: {
  community: CommunityWithOwner
  communityId: string
  update: UpdateCommunityInput
  query: TransactionQuery
}): (ImageSurfaceReference & { nextImageId: string | null })[] {
  const references: (ImageSurfaceReference & { nextImageId: string | null })[] = []
  if ('profile_image_id' in input.update) {
    references.push({
      surfaceKind: 'community-profile-image',
      communityId: input.communityId,
      nextImageId: input.update.profile_image_id ?? null,
    })
  }
  if ('banner_image_id' in input.update) {
    references.push({
      surfaceKind: 'community-banner-image',
      communityId: input.communityId,
      nextImageId: input.update.banner_image_id ?? null,
    })
  }
  return references
}

function publicationChanged(
  update: UpdateCommunityInput,
  locked: { visibility: CommunityVisibility; slug: string },
): boolean {
  return (
    (update.visibility !== undefined && update.visibility !== locked.visibility) ||
    (update.slug !== undefined && update.slug !== locked.slug)
  )
}
