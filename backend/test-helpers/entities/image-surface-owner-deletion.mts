import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  reserveImagePlacementChanges,
  releaseImagePlacementReservations,
} from '../../services/media-delivery-safety/placement-capacity-reservations.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { imageDeliveryIsAuthorized } from '../../services/media-delivery-safety/delivery-authority.mts'
import { lockImageDeliveryMutation } from '../../services/media-delivery-safety/delivery-lock.mts'

export async function testImageSurfaceDeliveryIsAuthorized(input: {
  placement_id: string
  placement_revision: number
  image_id: string
}): Promise<boolean> {
  await using transaction = await beginTransaction()
  await lockImageDeliveryMutation(transaction, {
    placementIds: [input.placement_id],
    placementOnly: true,
  })
  const allowed = await imageDeliveryIsAuthorized(transaction, input)
  return allowed
}

export async function retireTestImageSurfaceOwner(
  query: TransactionQuery,
  placementId: string,
): Promise<void> {
  await query(sql`/* retireTestImageSurfaceOwner */ UPDATE media_placements SET retired_at = CURRENT_TIMESTAMP,
    retirement_reason = 'owner_removed', revision = revision + 1 WHERE id = ${placementId}`)
  await releaseImagePlacementReservations(query, [placementId])
}

export async function clearTestImageSurfaceOwnerInTransaction(
  query: TransactionQuery,
  placementId: string,
): Promise<void> {
  await query(
    sql`/* clearTestImageSurfaceOwnerInTransaction */ UPDATE image_surface_placements SET user_profile_link_id = NULL WHERE placement_id = ${placementId}`,
  )
}

export async function reactivateTestImageSurfaceInTransaction(
  query: TransactionQuery,
  placementId: string,
): Promise<void> {
  await query(sql`/* reactivateTestImageSurfaceInTransaction */ UPDATE media_placements SET retired_at = NULL,
    retirement_reason = NULL, revision = revision + 1 WHERE id = ${placementId}`)
  const { rows } = await query<{
    image_id: string
    activation_revision: number
  }>(sql`/* reactivateTestImageSurfaceCapacity */
    SELECT surface.image_id, placement.activation_revision FROM image_surface_placements surface
    JOIN media_placements placement ON placement.id = surface.placement_id WHERE surface.placement_id = ${placementId}`)
  if (!rows[0]) throw new Error('Missing surface fixture')
  await reserveImagePlacementChanges(
    query,
    [],
    [
      {
        placementId,
        imageId: rows[0].image_id,
        activationRevision: rows[0].activation_revision,
        bindingFamily: 'surface',
      },
    ],
  )
}

export async function changeTestOwnerlessImageSurfaceRetirementReason(
  placementId: string,
): Promise<void> {
  await write(
    sql`/* changeTestOwnerlessImageSurfaceRetirementReason */ UPDATE media_placements SET retirement_reason = 'asset_deleted', revision = revision + 1 WHERE id = ${placementId}`,
  )
}

export async function readTestImageSurfaceOwner(placementId: string) {
  const { rows } = await read<{
    user_id: string | null
    user_profile_link_id: string | null
    retired_at: Date | null
    retirement_reason: string | null
  }>(sql`/* readTestImageSurfaceOwner */
    SELECT surface.user_id, surface.user_profile_link_id, placement.retired_at, placement.retirement_reason
    FROM image_surface_placements surface JOIN media_placements placement ON placement.id = surface.placement_id
    WHERE surface.placement_id = ${placementId}
  `)
  return rows[0]
}

export async function deleteTestImageProfileLink(linkId: string, rollback = false): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    sql`/* deleteTestImageProfileLink */ DELETE FROM user_profile_links WHERE id = ${linkId}`,
  )
  if (!rollback) await transaction.commit()
}

export async function clearTestActiveImageSurfaceOwner(placementId: string): Promise<void> {
  await write(sql`/* clearTestActiveImageSurfaceOwner */
    UPDATE image_surface_placements SET user_profile_link_id = NULL WHERE placement_id = ${placementId}
  `)
}

export async function reactivateTestOwnerlessImageSurface(placementId: string): Promise<void> {
  await write(sql`/* reactivateTestOwnerlessImageSurface */
    UPDATE media_placements SET retired_at = NULL, retirement_reason = NULL, revision = revision + 1
    WHERE id = ${placementId}
  `)
}

export async function insertTestOwnerlessImageSurface(imageId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* insertTestOwnerlessImageSurface */
    WITH placement AS (INSERT INTO media_placements DEFAULT VALUES RETURNING id)
    INSERT INTO image_surface_placements (placement_id, surface_kind, image_id)
    SELECT id, 'user-profile-link-image', ${imageId} FROM placement
  `)
  await transaction.commit()
}
