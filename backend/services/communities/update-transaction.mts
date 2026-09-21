import type { TransactionQuery } from '@data-stores/psql/types'
import { prepublishImageSurfaceDenial } from '@services/media-delivery-safety'
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
  const locked = await lockCommunityPublicationInputs(input.query, input.communityId)
  const rowCount = await prepublishAndUpdateCommunity(input)
  return { locked, rowCount }
}

async function prepublishAndUpdateCommunity(
  input: Parameters<typeof updateCommunityInTransaction>[0],
): Promise<number | null> {
  await prepublishChangedCommunitySurfaces(input)
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
  if (
    'profile_image_id' in input.update &&
    input.update.profile_image_id !== input.community.profile_image_id
  ) {
    await prepublishImageSurfaceDenial(
      { surfaceKind: 'community-profile-image', communityId: input.communityId },
      input.query,
    )
  }
  if (
    'banner_image_id' in input.update &&
    input.update.banner_image_id !== input.community.banner_image_id
  ) {
    await prepublishImageSurfaceDenial(
      { surfaceKind: 'community-banner-image', communityId: input.communityId },
      input.query,
    )
  }
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
