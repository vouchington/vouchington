import type { TransactionQuery } from '@data-stores/psql/types'
import {
  prepublishImageSurfaceDenials,
  type ImageSurfaceReference,
} from '@services/media-delivery-safety'
import { recordPostPublicationChange } from '@services/post-publication'
import type { CommunityWithOwner } from './get.mts'
import type { UpdateCommunityInput } from './update.mts'
import type { CommunityVisibility } from './types.mts'

export async function updateCommunityInTransaction(input: {
  community: CommunityWithOwner
  communityId: string
  update: UpdateCommunityInput
  statement: { text: string; values: unknown[] }
  query: TransactionQuery
}): Promise<void> {
  const { locked, rowCount } = await applyLockedCommunityUpdate(input)
  if ((rowCount ?? 0) > 0 && locked && publicationChanged(input.update, locked)) {
    await recordPostPublicationChange(input.query, {
      scope: { type: 'community', communityId: input.communityId },
      reason: 'community_visibility_changed',
      impactedCommunityIds: [input.communityId],
      footprint: { priorCommunityId: input.communityId, priorCommunitySlug: locked.slug },
    })
  }
}

async function applyLockedCommunityUpdate(
  input: Parameters<typeof updateCommunityInTransaction>[0],
) {
  // ast-grep-ignore: no-three-sequential-awaits -- retain surface owner fences before the physical community row lock and its dependent update
  await prepublishChangedCommunitySurfaces(input)
  const locked = await lockCommunityPublicationInputs(input.query, input.communityId)
  const rowCount = await prepublishAndUpdateCommunity(input)
  return { locked, rowCount }
}

async function prepublishAndUpdateCommunity(
  input: Parameters<typeof updateCommunityInTransaction>[0],
): Promise<number | null> {
  const result = await input.query(input.statement.text, input.statement.values)
  return result.rowCount
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
}): Promise<void> {
  const references: ImageSurfaceReference[] = []
  if ('profile_image_id' in input.update) {
    references.push({ surfaceKind: 'community-profile-image', communityId: input.communityId })
  }
  if ('banner_image_id' in input.update) {
    references.push({ surfaceKind: 'community-banner-image', communityId: input.communityId })
  }
  await prepublishImageSurfaceDenials(references, input.query)
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
