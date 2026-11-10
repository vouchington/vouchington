import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestImageSurfacePlacementActivation = {
  placement_id: string
  surface_kind: string
  placement_revision: number
  bound_by_id: string
  uploaded_by_id: string
  is_bound_by_administrator: boolean | null
  bound_at: Date
}

/** Reads activation history only for an owned placement. */
export async function getTestImageSurfacePlacementActivations(
  placementId: string,
): Promise<TestImageSurfacePlacementActivation[]> {
  const { rows } = await read<TestImageSurfacePlacementActivation>(sql`
    /* getTestImageSurfacePlacementActivations */
    SELECT placement_id, surface_kind, placement_revision, bound_by_id,
      uploaded_by_id, is_bound_by_administrator, bound_at
    FROM image_surface_placement_activations
    WHERE placement_id = ${placementId}
    ORDER BY placement_revision
  `)
  return rows
}

/** Uses only the user-profile-image database trigger to retire and reactivate an owned placement. */
export async function reactivateTestUserProfileImageThroughDatabaseTrigger(
  userId: string,
  imageId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* reactivateTestUserProfileImageThroughDatabaseTrigger:retire */
    UPDATE users SET profile_image_id = NULL WHERE id = ${userId}
  `)
  await transaction(sql`/* reactivateTestUserProfileImageThroughDatabaseTrigger:reactivate */
    UPDATE users SET profile_image_id = ${imageId} WHERE id = ${userId}
  `)
  await transaction.commit()
}

/** Exercises the immutable activation trigger by changing the activation timestamp. */
export async function updateTestImageSurfacePlacementActivation(
  placementId: string,
  placementRevision: number,
): Promise<void> {
  await write(sql`/* updateTestImageSurfacePlacementActivation */
    UPDATE image_surface_placement_activations
    SET bound_at = bound_at + INTERVAL '1 second'
    WHERE placement_id = ${placementId} AND placement_revision = ${placementRevision}
  `)
}

/** Exercises the immutable activation trigger by deleting one owned activation. */
export async function deleteTestImageSurfacePlacementActivation(
  placementId: string,
  placementRevision: number,
): Promise<void> {
  await write(sql`/* deleteTestImageSurfacePlacementActivation */
    DELETE FROM image_surface_placement_activations
    WHERE placement_id = ${placementId} AND placement_revision = ${placementRevision}
  `)
}
