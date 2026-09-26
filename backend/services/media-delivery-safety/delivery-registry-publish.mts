import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  isMediaDeliveryRegistryPublicationEnabled,
  type MediaDeliveryRegistryState,
} from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { assertImageDeliveryTransaction } from './transaction-contract.mts'
import { stageImagePlacementDeliveryRecord } from './delivery-registry-staging.mts'
import { recordImageDeliveryRepairMarker } from './delivery-repair-markers.mts'
import type { ImageDeliveryRecord, MediaDeliveryDependencies } from './delivery-registry-types.mts'
import { publishPersistedDeliveryRecord } from './delivery-registry-acknowledgement.mts'
import {
  imageDeliveryIsAuthorized,
  lockImageDeliveryLegalAuthority,
} from './delivery-authority.mts'

export async function publishImagePlacementDeliveryRecord(
  input: {
    placementId: string
    revision: number
    imageId: string
    state: MediaDeliveryRegistryState
  },
  options: QueryOptions = {},
): Promise<void> {
  if (!options.query) {
    await using transaction = await beginTransaction()
    await publishImagePlacementDeliveryRecord(input, { query: transaction })
    await transaction.commit()
    return
  }
  const query = options.query
  await lockImageDeliveryMutation(query, {
    placementIds: [input.placementId],
    placementOnly: true,
  })
  if (input.state === 'allow')
    await lockImageDeliveryLegalAuthority(query, {
      placement_id: input.placementId,
    })
  if (input.state === 'withheld' && isMediaDeliveryRegistryPublicationEnabled())
    await recordImageDeliveryRepairMarker(input)
  const staged = await stageImagePlacementDeliveryRecord(input, { query })
  if (input.state === 'withheld') {
    if (isMediaDeliveryRegistryPublicationEnabled())
      await publishPersistedDeliveryRecord(
        {
          delivery_key: staged.deliveryKey,
          desired_state: 'withheld',
          placement_id: input.placementId,
          placement_revision: input.revision,
          image_id: input.imageId,
          generation: staged.generation,
        },
        query,
      )
    return
  }
  await publishStagedMediaDeliveryRecord(staged.deliveryKey, { query })
}

/** Publishes only the immutable tuple already staged by an authority-owning transaction. */
export async function publishStagedMediaDeliveryRecord(
  deliveryKey: string,
  options: QueryOptions & { dependencies?: Partial<MediaDeliveryDependencies> } = {},
): Promise<void> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  if (!options.query) {
    await using transaction = await beginTransaction()
    await publishStagedMediaDeliveryRecord(deliveryKey, {
      query: transaction,
      dependencies: options.dependencies,
    })
    await transaction.commit()
    return
  }
  const query = options.query ?? write
  assertImageDeliveryTransaction(query)
  const { rows } = await query<ImageDeliveryRecord>(sql`
    /* publishStagedMediaDeliveryRecord */
    SELECT delivery_key, desired_state, placement_id, placement_revision, image_id, generation
    FROM media_delivery_registry_records
    WHERE delivery_key = ${deliveryKey}
  `)
  const record = rows[0]
  if (!record) throw new Error(`Missing staged image placement delivery record ${deliveryKey}`)
  // ast-grep-ignore: no-three-sequential-awaits -- placement authority precedes notice locks and registry reread
  await lockImageDeliveryMutation(query, {
    placementIds: [record.placement_id],
    placementOnly: true,
  })
  await lockImageDeliveryLegalAuthority(query, record)
  const current = await readCurrentPlacementDeliveryRecord(query, deliveryKey)
  if (!current) throw new Error(`Missing staged image placement delivery record ${deliveryKey}`)
  const publishable =
    current.desired_state === 'withheld' || (await imageDeliveryIsAuthorized(query, current))
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
    : await readCurrentPlacementDeliveryRecord(query, deliveryKey)
  if (!recordToPublish) throw new Error(`Failed to restage withheld delivery record ${deliveryKey}`)
  await publishPersistedDeliveryRecord(recordToPublish, query, options.dependencies)
}

async function readCurrentPlacementDeliveryRecord(
  query: NonNullable<QueryOptions['query']>,
  deliveryKey: string,
): Promise<ImageDeliveryRecord | null> {
  const { rows } = await query<ImageDeliveryRecord>(sql`
    /* readCurrentPlacementDeliveryRecord */
    SELECT delivery_key, desired_state, placement_id, placement_revision, image_id, generation
    FROM media_delivery_registry_records
    WHERE delivery_key = ${deliveryKey}
    FOR UPDATE
  `)
  return rows[0] ?? null
}
