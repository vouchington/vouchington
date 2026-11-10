import { beginTransaction, read, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'
import {
  admitImagePlacements,
  projectImagePlacementPolicy,
  withImagePlacementMutation,
} from '../services/media-delivery-safety/placement-capacity-reservations.mts'
import type { ImagePlacementAdmission } from '../services/media-delivery-safety/placement-capacity-types.mts'

async function pendingClaims(
  query: TransactionQuery,
  postId: string,
  imageIds: readonly string[],
  placementIds = imageIds.map(() => v7()),
) {
  await admitImagePlacements(
    query,
    imageIds.map(imageId => ({ imageId })),
  )
  await query(sql`/* pendingTestCapacityClaims */
    WITH requested AS MATERIALIZED (
      SELECT * FROM unnest(${placementIds}::uuid[], ${[...imageIds]}::uuid[])
        input(placement_id, image_id)
    ), retained AS (
      INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
      SELECT placement_id, image_id, 'post' FROM requested RETURNING placement_id, image_id
    ), parents AS (
      INSERT INTO media_placements (id) SELECT placement_id FROM retained RETURNING id
    ) INSERT INTO image_placements (placement_id, post_id, image_id)
      SELECT parents.id, ${postId}, retained.image_id FROM parents
      JOIN retained ON retained.placement_id = parents.id`)
  await projectImagePlacementPolicy(query, placementIds)
  return imageIds.map((imageId, index): ImagePlacementAdmission => ({
    placementId: placementIds[index]!,
    imageId,
    alreadyActive: true,
  }))
}

/** The real multi-image phase creates and commits every incoming activation together. */
export async function commitTestImageCapacityBatch(postId: string, imageIds: readonly string[]) {
  await using query = await beginTransaction()
  const claims = await pendingClaims(query, postId, imageIds)
  await query.commit()
  return claims
}

/** Replaying exact live activations must not consume capacity under a lower configured cap. */
export async function replayTestImageCapacityBatch(claims: readonly ImagePlacementAdmission[]) {
  await using query = await beginTransaction()
  await admitImagePlacements(
    query,
    claims.map(claim => ({ ...claim, alreadyActive: true })),
  )
  await query.commit()
}

/** A refused image leaves the outgoing placement active. */
export async function refuseTestImageCapacityReplacement(
  postId: string,
  outgoingPlacementId: string,
  incomingImageId: string,
) {
  await using query = await beginTransaction()
  const error = await admitImagePlacements(query, [{ imageId: incomingImageId }]).then(
    () => null,
    (err: unknown) => err,
  )
  if (!error) {
    await query(sql`/* retireTestCapacityReplacementOwner */
      UPDATE media_placements SET retired_at = CURRENT_TIMESTAMP,
        retirement_reason = 'owner_removed', revision = revision + 1
      WHERE id = ${outgoingPlacementId}`)
    await pendingClaims(query, postId, [incomingImageId])
  }
  const { rows } = await query<{
    retired_at: Date | null
  }>(sql`/* readTestRestoredCapacityRelease */
    SELECT retired_at FROM media_placements WHERE id = ${outgoingPlacementId}`)
  return { error, active: rows[0]?.retired_at == null }
}

export async function readTestCapacityBatch(imageIds: readonly string[]) {
  const { rows } = await read<{ image_id: string; occupied: number }>(sql`
    /* readTestCapacityBatch */
    SELECT binding.image_id, count(*)::int AS occupied
    FROM retained_image_placement_bindings binding
    JOIN media_placements placement ON placement.id = binding.placement_id
    WHERE binding.image_id = ANY(${[...imageIds]}::uuid[])
      AND placement.retired_at IS NULL
    GROUP BY binding.image_id
    ORDER BY binding.image_id`)
  return rows
}

class TestSettlementDeadlock extends Error {
  readonly code = '40P01'

  constructor() {
    super('settlement deadlock')
    this.name = 'TestSettlementDeadlock'
  }
}

/** Settlement errors roll back mutation SQL without rerunning externally visible settlement. */
export async function failTestImageCapacitySettlement(imageId: string) {
  await using query = await beginTransaction()
  const { rows: before } = await query<{ s3_key: string }>(sql`/* readTestCapacityPhaseBefore */
    SELECT s3_key FROM images WHERE id = ${imageId}`)
  const failure = new TestSettlementDeadlock()
  let mutations = 0
  let settlements = 0
  const error = await withImagePlacementMutation(
    query,
    async scope => {
      mutations++
      await scope(sql`/* writeTestCapacityMutationPhase */
        UPDATE images SET s3_key = s3_key || '-mutation' WHERE id = ${imageId}`)
      return imageId
    },
    async () => {
      settlements++
      throw failure
    },
  ).then(
    () => null,
    (err: unknown) => err,
  )
  const { rows: restored } = await query<{ s3_key: string }>(sql`/* readTestCapacityPhaseRollback */
    SELECT s3_key FROM images WHERE id = ${imageId}`)
  await query(sql`/* writeTestCapacityRetainedCaller */
    UPDATE images SET s3_key = s3_key || '-caller' WHERE id = ${imageId}`)
  await query.commit()
  const { rows: committed } = await read<{ s3_key: string }>(sql`/* readTestCapacityCallerCommit */
    SELECT s3_key FROM images WHERE id = ${imageId}`)
  return {
    error,
    failure,
    mutations,
    settlements,
    before: before[0]!.s3_key,
    restored: restored[0]!.s3_key,
    committed: committed[0]!.s3_key,
  }
}
