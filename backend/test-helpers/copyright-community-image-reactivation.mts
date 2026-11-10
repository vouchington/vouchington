import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  admitImagePlacements,
  projectImagePlacementPolicy,
} from '../services/media-delivery-safety/placement-capacity-reservations.mts'
import type { LiftSurfaceFixture } from './copyright-administrator-lift-fixtures.mts'

/** Rebinds a detached community image through its database trigger, without an application actor. */
export async function reactivateTestCommunityImageWithoutBinder(fixture: LiftSurfaceFixture) {
  if (
    fixture.selector.surfaceKind !== 'community-profile-image' &&
    fixture.selector.surfaceKind !== 'community-banner-image'
  )
    throw new Error('Expected community image')
  await fixture.detach()
  const column =
    fixture.selector.surfaceKind === 'community-profile-image'
      ? sql`profile_image_id`
      : sql`banner_image_id`
  const statement = sql`/* reactivateTestCommunityImageWithoutBinder */ UPDATE communities SET `
  statement.append(column).append(sql` = ${fixture.imageId} WHERE id = ${fixture.ownerId}`)
  await using transaction = await beginTransaction()
  await admitImagePlacements(transaction, [{ imageId: fixture.imageId }])
  await transaction(statement)
  const { rows: active } = await transaction<{
    placement_id: string
    activation_revision: number
    placement_revision: number
  }>(sql`/* reactivateTestCommunityImageWithoutBinder:capacity */
    SELECT surface.placement_id, placement.activation_revision, placement.revision AS placement_revision
    FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
    WHERE surface.community_id = ${fixture.ownerId} AND surface.image_id = ${fixture.imageId}
      AND surface.surface_kind = ${fixture.selector.surfaceKind} AND placement.retired_at IS NULL`)
  if (active.length !== 1) throw new Error('Trigger did not reactivate exactly one community image')
  await projectImagePlacementPolicy(
    transaction,
    active.map(row => row.placement_id),
  )
  await transaction.commit()
  return active[0]!
}
