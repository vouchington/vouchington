import { beginTransaction } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { stageImagePlacementDeliveryRecord } from './delivery-registry-staging.mts'
import { recordImageDeliveryRepairMarker } from './delivery-repair-markers.mts'
import type { ImageDeliveryRecord, MediaDeliveryDependencies } from './delivery-registry-types.mts'
import {
  claimMediaDeliveryProjection,
  ownsMediaDeliveryProjection,
  type MediaDeliveryClaim,
} from './delivery-registry-claims.mts'
import { publishPersistedDeliveryRecord } from './delivery-registry-acknowledgement.mts'
import {
  imageDeliveryIsAuthorized,
  lockImageDeliveryLegalAuthority,
} from './delivery-authority.mts'

export async function prepublishImagePlacementDenial(
  input: {
    placementId: string
    revision: number
    imageId: string
  },
  options: QueryOptions = {},
): Promise<void> {
  if (!options.query) {
    await using transaction = await beginTransaction()
    await prepublishImagePlacementDenial(input, { query: transaction })
    await transaction.commit()
    return
  }
  const query = options.query
  await lockImageDeliveryMutation(query, {
    placementIds: [input.placementId],
    placementOnly: true,
  })
  if (isMediaDeliveryRegistryPublicationEnabled()) await recordImageDeliveryRepairMarker(input)
  const staged = await stageImagePlacementDeliveryRecord(
    { ...input, state: 'withheld' },
    { query, forceGeneration: true },
  )
  if (isMediaDeliveryRegistryPublicationEnabled()) {
    const claim = await claimMediaDeliveryProjection(query, staged.mediaDeliveryRegistryRecordId)
    if (!claim)
      throw new Error(
        `Media delivery projection is already owned ${staged.mediaDeliveryRegistryRecordId}`,
      )
    await publishPersistedDeliveryRecord(claim, query)
  }
}

/** Publishes only the immutable tuple already staged by an authority-owning transaction. */
export async function publishStagedMediaDeliveryRecord(
  mediaDeliveryRegistryRecordId: string,
  options: { dependencies?: Partial<MediaDeliveryDependencies>; claim?: MediaDeliveryClaim } = {},
): Promise<void> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  await using transaction = await beginTransaction()
  await publishCommittedDeliveryRecord(
    mediaDeliveryRegistryRecordId,
    transaction,
    options.dependencies,
    options.claim,
  )
  await transaction.commit()
}

async function publishCommittedDeliveryRecord(
  mediaDeliveryRegistryRecordId: string,
  query: NonNullable<QueryOptions['query']>,
  dependencies?: Partial<MediaDeliveryDependencies>,
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
  // ast-grep-ignore: no-three-sequential-awaits -- placement authority precedes notice locks and registry reread
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
  await publishPersistedDeliveryRecord(claim, query, dependencies)
}

async function readCurrentPlacementDeliveryRecord(
  query: NonNullable<QueryOptions['query']>,
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
