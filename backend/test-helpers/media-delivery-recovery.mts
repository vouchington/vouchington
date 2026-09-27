import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestImage } from './entities/images-insert.mts'
import { insertTestPost } from './entities/posts.mts'
import { insertTestPostImage } from './entities/images.mts'
import { getTestPostImagePlacement } from './entities/post-images.mts'
import {
  failExpiredExhaustedMediaDeliveryRegistryRecords,
  getMediaDeliveryRegistryScanBefore,
  listRecoverableMediaDeliveryRegistryKeys,
  stageImagePlacementDeliveryRecord,
} from '../services/media-delivery-safety/index.mts'

export async function withTestMediaRecoveryBacklog<T>(
  userId: string,
  count: number,
  run: (fixture: {
    deliveryKeys: string[]
    scanBefore: string
    placements: Array<{ placementId: string; revision: number; imageId: string }>
  }) => Promise<T>,
): Promise<T> {
  const postId = await insertTestPost({
    title: 'Owned media recovery backlog',
    slug: crypto.randomUUID(),
    createdById: userId,
    markdown: 'Recovery fixture images',
  })
  const imageIds = await Promise.all(Array.from({ length: count }, () => insertTestImage(userId)))
  const placements = await Promise.all(
    imageIds.map(async (imageId, orderIndex) => {
      await insertTestPostImage({ postId, imageId, orderIndex })
      const placement = await getTestPostImagePlacement(postId, imageId)
      if (!placement) throw new Error('Missing owned recovery placement')
      return {
        placementId: placement.placement_id,
        revision: placement.placement_revision,
        imageId,
      }
    }),
  )
  const records = await Promise.all(
    placements.map(placement =>
      stageImagePlacementDeliveryRecord({ ...placement, state: 'withheld' }),
    ),
  )
  const deliveryKeys = records.map(record => record.deliveryKey).sort()
  return await run({
    deliveryKeys,
    placements,
    scanBefore: await getMediaDeliveryRegistryScanBefore(),
  })
}

export async function setTestMediaRecoveryState(
  deliveryKeys: readonly string[],
  input: {
    state: 'pending' | 'claimed' | 'completed' | 'failed'
    attempts: number
    at: string
    nextAttemptAt?: string
    createdAt?: string
  },
): Promise<void> {
  await write(sql`/* setTestMediaRecoveryState */
    UPDATE media_delivery_registry_records
    SET state = ${input.state}, delivery_attempt_count = ${input.attempts},
      claimed_at = CASE WHEN ${input.state} = 'pending' THEN NULL ELSE ${input.at}::timestamptz END,
      completed_at = CASE WHEN ${input.state} IN ('completed', 'failed') THEN ${input.at}::timestamptz ELSE NULL END,
      next_attempt_at = ${input.nextAttemptAt ?? null}::timestamptz,
      failure_message = 'Owned recovery failure evidence',
      created_at = COALESCE(${input.createdAt ?? null}::timestamptz, created_at)
    WHERE delivery_key = ANY(${deliveryKeys}::text[])
  `)
}

export async function withLockedTestMediaDeliveryRecord<T>(
  deliveryKey: string,
  run: () => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  await transaction(
    sql`SELECT delivery_key FROM media_delivery_registry_records WHERE delivery_key = ${deliveryKey} FOR UPDATE`,
  )
  return await run()
}

/** Real production queries restricted to explicitly owned records; no substituted persistence. */
export function scopedTestMediaRecoveryDependencies(deliveryKeys: readonly string[]) {
  return {
    listRecoverableMediaDeliveryRegistryKeys: (
      input: Parameters<typeof listRecoverableMediaDeliveryRegistryKeys>[0],
    ) => listRecoverableMediaDeliveryRegistryKeys({ ...input, deliveryKeys }),
    failExpiredExhaustedMediaDeliveryRegistryRecords: (now: string) =>
      failExpiredExhaustedMediaDeliveryRegistryRecords(now, deliveryKeys),
  }
}
