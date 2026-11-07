import { beginTransaction } from '@data-stores/psql'
import type { QueryExecutor, QueryOptions } from '@data-stores/psql/types'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import {
  stageImagePlacementDeliveryRecord,
  stageImagePlacementDeliveryRecords,
} from './delivery-registry-staging.mts'
import {
  recordImageDeliveryRepairMarker,
  recordImageDeliveryRepairMarkers,
} from './delivery-repair-markers.mts'
import type { ImageDeliveryRecord } from './delivery-registry-types.mts'
import {
  claimMediaDeliveryProjection,
  claimMediaDeliveryProjections,
  ownsMediaDeliveryProjection,
  type MediaDeliveryClaim,
} from './delivery-registry-claims.mts'
import {
  getEdgePublishBatchSize,
  publishPersistedDeliveryRecord,
  publishPersistedDeliveryRecords,
} from './delivery-registry-acknowledgement.mts'
import {
  imageDeliveryIsAuthorized,
  lockImageDeliveryLegalAuthority,
} from './delivery-authority.mts'

type PlacementDenial = { placementId: string; revision: number; imageId: string }

export async function prepublishImagePlacementDenial(
  input: PlacementDenial,
  options: QueryOptions & { placementLocked?: boolean } = {},
): Promise<void> {
  await prepublishImagePlacementDenialBatch([input], options)
}

/** Withholds, stages and publishes every tuple with one statement per step. */
export async function prepublishImagePlacementDenialBatch(
  inputs: readonly PlacementDenial[],
  options: QueryOptions & { placementLocked?: boolean } = {},
): Promise<void> {
  if (inputs.length === 0) return
  if (!options.query) {
    await using transaction = await beginTransaction()
    await prepublishImagePlacementDenialBatch(inputs, { query: transaction })
    await transaction.commit()
    return
  }
  const query = options.query
  // A caller that already held these placements' locks (lockImageSurfacePlacements) passes it down.
  if (!options.placementLocked)
    await lockImageDeliveryMutation(query, {
      placementIds: inputs.map(input => input.placementId),
      placementOnly: true,
    })
  if (isMediaDeliveryRegistryPublicationEnabled()) await recordImageDeliveryRepairMarkers(inputs)
  const staged = await stageImagePlacementDeliveryRecords(
    inputs.map(input => ({ ...input, state: 'withheld' as const })),
    { query, forceGeneration: true },
  )
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  const recordIds = [...staged.values()].map(record => record.mediaDeliveryRegistryRecordId)
  const batchSize = getEdgePublishBatchSize()
  for (let offset = 0; offset < recordIds.length; offset += batchSize) {
    const batchIds = recordIds.slice(offset, offset + batchSize)
    // oxlint-disable-next-line no-await-in-loop -- each constant-size group is claimed, published and acknowledged inside its own lease
    const claims = await claimMediaDeliveryProjections(query, batchIds) // no-mistakes-disable-line query-reached-per-item: groups of edge_publish_batch_size (default 4, max 16) so each group's claim lease covers its own edge calls; the denial must reach the edge before the owner mutation, so it cannot queue; iterations = placements of one image or post / batch size
    if (claims.length !== batchIds.length) {
      const claimed = new Set(claims.map(claim => claim.media_delivery_registry_record_id))
      throw new Error(
        `Media delivery projection is already owned ${batchIds.find(id => !claimed.has(id))}`,
      )
    }
    // oxlint-disable-next-line no-await-in-loop -- acknowledge before the next group's lease starts
    await publishPersistedDeliveryRecords(claims, query) // no-mistakes-disable-line query-reached-per-item: same group as the claim above; acknowledges the group's receipts in one statement before the next lease starts
  }
}

/** Publishes only the immutable tuple already staged by an authority-owning transaction. */
export async function publishStagedMediaDeliveryRecord(
  mediaDeliveryRegistryRecordId: string,
  options: { claim?: MediaDeliveryClaim } = {},
): Promise<void> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  await using transaction = await beginTransaction()
  await publishCommittedDeliveryRecord(mediaDeliveryRegistryRecordId, transaction, options.claim)
  await transaction.commit()
}

async function publishCommittedDeliveryRecord(
  mediaDeliveryRegistryRecordId: string,
  query: QueryExecutor,
  ownedClaim?: MediaDeliveryClaim,
): Promise<void> {
  const { rows } = await query<ImageDeliveryRecord>(sql`
    /* publishStagedMediaDeliveryRecord */
    SELECT media_delivery_registry_record_id, desired_state, placement_id, placement_revision, image_id, generation, state
    FROM view_media_delivery_registry_current_records
    WHERE media_delivery_registry_record_id = ${mediaDeliveryRegistryRecordId}
  `)
  const record = rows[0]
  if (!record)
    throw new Error(
      `Missing staged image placement delivery record ${mediaDeliveryRegistryRecordId}`,
    )
  // ast-grep-ignore: no-three-sequential-awaits -- Placement ownership must be locked before legal-notice authority locks; the registry reread must use a fresh snapshot after those blocking fences.
  await lockImageDeliveryMutation(query, {
    placementIds: [record.placement_id],
    placementOnly: true,
  })
  await lockImageDeliveryLegalAuthority(query, record)
  const current = await readCurrentPlacementDeliveryRecord(query, mediaDeliveryRegistryRecordId)
  if (!current)
    throw new Error(
      `Missing staged image placement delivery record ${mediaDeliveryRegistryRecordId}`,
    )
  if (
    ownedClaim &&
    (ownedClaim.generation !== current.generation ||
      !(await ownsMediaDeliveryProjection(query, ownedClaim)))
  )
    throw new Error(
      `Media delivery generation changed while publishing ${mediaDeliveryRegistryRecordId}`,
    )
  const publishable =
    current.desired_state === 'withheld' || (await imageDeliveryIsAuthorized(query, current))
  if (publishable && !ownedClaim && current.state === 'completed') return
  if (!publishable) {
    // This denial is newly minted inside the publication transaction. If its acknowledgement
    // rolls back, repair must advance beyond the token already accepted by the edge.
    await recordImageDeliveryRepairMarker({
      placementId: current.placement_id,
      revision: current.placement_revision,
      imageId: current.image_id,
    })
  }
  if (!publishable)
    await stageImagePlacementDeliveryRecord(
      {
        placementId: current.placement_id,
        revision: current.placement_revision,
        imageId: current.image_id,
        state: 'withheld',
      },
      { query, forceGeneration: true },
    )
  const recordToPublish = publishable
    ? current
    : await readCurrentPlacementDeliveryRecord(query, mediaDeliveryRegistryRecordId)
  if (!recordToPublish)
    throw new Error(`Failed to restage withheld delivery record ${mediaDeliveryRegistryRecordId}`)
  const claim =
    ownedClaim && ownedClaim.generation === recordToPublish.generation
      ? { ...recordToPublish, lease_token: ownedClaim.lease_token }
      : await claimMediaDeliveryProjection(query, mediaDeliveryRegistryRecordId)
  if (!claim)
    throw new Error(`Media delivery projection is already owned ${mediaDeliveryRegistryRecordId}`)
  await publishPersistedDeliveryRecord(claim, query)
}

async function readCurrentPlacementDeliveryRecord(
  query: QueryExecutor,
  mediaDeliveryRegistryRecordId: string,
): Promise<ImageDeliveryRecord | null> {
  await query(sql`/* readCurrentPlacementDeliveryRecord:lock */
    SELECT id FROM media_delivery_registry_records WHERE id = ${mediaDeliveryRegistryRecordId} FOR NO KEY UPDATE
  `)
  const { rows } = await query<ImageDeliveryRecord>(sql`
    /* readCurrentPlacementDeliveryRecord */
    SELECT media_delivery_registry_record_id, desired_state, placement_id, placement_revision, image_id, generation, state
    FROM view_media_delivery_registry_current_records
    WHERE media_delivery_registry_record_id = ${mediaDeliveryRegistryRecordId}
  `)
  return rows[0] ?? null
}
