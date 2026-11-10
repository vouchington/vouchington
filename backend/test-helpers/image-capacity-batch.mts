import { beginTransaction, read, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'
import {
  reserveImagePlacementChanges,
  withImagePlacementMutation,
} from '../services/media-delivery-safety/placement-capacity-reservations.mts'
import type { ImagePlacementCapacityReservation } from '../services/media-delivery-safety/placement-capacity-types.mts'
import { createTestPostgresLockWaiter } from './postgres-lock-waiter.mts'

async function pendingClaims(
  query: TransactionQuery,
  postId: string,
  imageIds: readonly string[],
  placementIds = imageIds.map(() => v7()),
) {
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
  return imageIds.map((imageId, index): ImagePlacementCapacityReservation => ({
    placementId: placementIds[index]!,
    imageId,
    bindingFamily: 'post',
    activationRevision: 0,
    postId,
  }))
}

/** The real multi-image phase creates and commits every concrete incoming activation together. */
export async function commitTestImageCapacityBatch(postId: string, imageIds: readonly string[]) {
  await using query = await beginTransaction()
  const claims = await pendingClaims(query, postId, imageIds)
  await reserveImagePlacementChanges(query, [], claims)
  await query.commit()
  return claims
}

/** Replaying exact live activations must not consume slots under a lower configured cap. */
export async function replayTestImageCapacityBatch(
  claims: readonly ImagePlacementCapacityReservation[],
) {
  await using query = await beginTransaction()
  await reserveImagePlacementChanges(query, [], claims)
  await query.commit()
}

/** A refused image must restore another image's outgoing slot before returning to its caller. */
export async function refuseTestImageCapacityReplacement(
  postId: string,
  outgoingPlacementId: string,
  incomingImageId: string,
) {
  await using query = await beginTransaction()
  await query(sql`/* retireTestCapacityReplacementOwner */
    UPDATE media_placements SET retired_at = CURRENT_TIMESTAMP,
      retirement_reason = 'owner_removed', revision = revision + 1
    WHERE id = ${outgoingPlacementId}`)
  const claims = await pendingClaims(query, postId, [incomingImageId])
  const error = await reserveImagePlacementChanges(query, [outgoingPlacementId], claims).then(
    () => null,
    (err: unknown) => err,
  )
  const { rows } = await query<{ slot_number: number }>(sql`/* readTestRestoredCapacityRelease */
    SELECT slot_number FROM image_placement_capacity_reservations WHERE placement_id = ${outgoingPlacementId}`)
  return { error, slots: rows.map(row => row.slot_number) }
}

/** Lose a unique slot after another image has already inserted, then inspect the retained caller. */
export async function conflictTestImageCapacityBatch(
  holderPostId: string,
  contenderPostId: string,
  imageIds: readonly string[],
) {
  await using holder = await beginTransaction()
  const winner = await pendingClaims(holder, holderPostId, [imageIds[1]!])
  await reserveImagePlacementChanges(holder, [], winner)
  const placementIds = imageIds.map(() => v7())
  await using waiter = await createTestPostgresLockWaiter({
    holder,
    lock: { kind: 'transaction' },
    selected: {
      marker: '/* claimImagePlacementReservations */',
      binding: { index: 0, value: placementIds },
    },
  })
  const claims = await pendingClaims(waiter.query, contenderPostId, imageIds, placementIds)
  const pending = reserveImagePlacementChanges(waiter.query, [], claims).then(
    () => null,
    (err: unknown) => err,
  )
  await waiter.waitForLock(pending)
  await holder.commit()
  const error = await pending
  const { rows } = await waiter.query<{ image_id: string; slot_number: number }>(sql`
    /* readTestCapacityBatchAfterConflict */ SELECT image_id, slot_number
    FROM image_placement_capacity_reservations WHERE image_id = ANY(${[...imageIds]}::uuid[])
    ORDER BY image_id, slot_number`)
  return { error, rows }
}

export async function readTestCapacityBatch(imageIds: readonly string[]) {
  const { rows } = await read<{ image_id: string; slot_number: number }>(sql`
    /* readTestCapacityBatch */ SELECT image_id, slot_number
    FROM image_placement_capacity_reservations WHERE image_id = ANY(${[...imageIds]}::uuid[])
    ORDER BY image_id, slot_number`)
  return rows
}

/** Settlement errors roll back mutation SQL without rerunning externally visible settlement. */
export async function failTestImageCapacitySettlement(imageId: string) {
  await using query = await beginTransaction()
  const { rows: before } = await query<{ s3_key: string }>(sql`/* readTestCapacityPhaseBefore */
    SELECT s3_key FROM images WHERE id = ${imageId}`)
  const failure = Object.assign(new Error('settlement deadlock'), { code: '40P01' })
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
