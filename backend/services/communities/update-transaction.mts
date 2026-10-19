import type { TransactionQuery } from '@data-stores/psql/types'
import {
  prepublishImageSurfaceDenials,
  syncImageSurfacePlacement,
  type ImageSurfaceReference,
} from '@services/media-delivery-safety'
import { recordPostPublicationChange } from '@services/post-publication'
import type { CommunityWithOwner } from './get.mts'
import { mapCommunityWithOwner, type CommunityRowWithOwner } from './get-mapping.mts'
import type { UpdateCommunityInput } from './update-types.mts'
import type { CommunityVisibility } from './types.mts'

export async function updateCommunityInTransaction(input: {
  community: CommunityWithOwner
  communityId: string
  actorUserId: string
  update: UpdateCommunityInput
  statement: { text: string; values: unknown[] }
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
  // ast-grep-ignore: no-three-sequential-awaits -- retain surface owner fences before the physical community row lock and its dependent update
  const surfaces = await prepublishChangedCommunitySurfaces(input)
  for (const surface of surfaces) {
    // oxlint-disable-next-line no-await-in-loop -- admission was declared and locked as one owner batch.
    await syncImageSurfacePlacement(
      surface,
      surface.nextImageId ?? null,
      surface.nextImageId ? input.actorUserId : null,
      input.query,
      { prepublished: true },
    )
  }
  const locked = await lockCommunityPublicationInputs(input.query, input.communityId)
  const updated = await prepublishAndUpdateCommunity(input)
  return { locked, updated }
}

async function prepublishAndUpdateCommunity(
  input: Parameters<typeof updateCommunityInTransaction>[0],
): Promise<CommunityWithOwner | null> {
  const result = await input.query<CommunityRowWithOwner>(
    input.statement.text,
    input.statement.values,
  )
  const row = result.rows[0]
  return row ? mapCommunityWithOwner(row) : null
}

async function lockCommunityPublicationInputs(
  query: TransactionQuery,
  communityId: string,
): Promise<{ visibility: CommunityVisibility; slug: string } | null> {
  const { rows } = await query<{ visibility: CommunityVisibility; slug: string }>(
    `/* updateCommunity:lockPublicationInputs */
    SELECT visibility, slug FROM communities WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [communityId],
  )
  return rows[0] ?? null
}

async function prepublishChangedCommunitySurfaces(input: {
  community: CommunityWithOwner
  communityId: string
  update: UpdateCommunityInput
  query: TransactionQuery
}): Promise<(ImageSurfaceReference & { nextImageId?: string | null })[]> {
  const references: (ImageSurfaceReference & { nextImageId?: string | null })[] = []
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
  await prepublishImageSurfaceDenials(references, input.query)
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
