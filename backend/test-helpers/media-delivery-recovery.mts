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
  const deliveryKeys = records.map(record => record.deliveryKey).toSorted()
  return run({
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
    INSERT INTO media_delivery_registry_changes(delivery_key, generation, change_type, delivery_attempt_count,
      claimed_at, completed_at, next_attempt_at, failure_message)
    SELECT delivery_key, generation, ${input.state}::media_delivery_registry_change_types, ${input.attempts},
      CASE WHEN ${input.state} = 'pending' THEN NULL ELSE ${input.at}::timestamptz END,
      CASE WHEN ${input.state} IN ('completed', 'failed') THEN ${input.at}::timestamptz ELSE NULL END,
      ${input.nextAttemptAt ?? null}::timestamptz, 'Owned recovery failure evidence'
    FROM media_delivery_registry_current_records
    WHERE delivery_key = ANY(${deliveryKeys}::text[])
  `)
  if (input.createdAt)
    await write(
      sql`UPDATE media_delivery_registry_records SET created_at = ${input.createdAt}::timestamptz WHERE delivery_key = ANY(${deliveryKeys}::text[])`,
    )
}

/**
 * The restore fence from the media-delivery reset/restore runbook: lift the generation sequence to
 * the observed edge high-water mark (never below its current value), then reopen the listed rows at
 * fresh generations. The sequence lift is global, which is harmless because generations only need to
 * increase; only the reopen is scoped to owned keys, because the shared test database is parallel.
 * Omit `edgeHighWater` for an empty edge, where any generation is accepted.
 */
export async function fenceTestMediaDeliveryRegistry(input: {
  edgeHighWater?: string
  reopenDeliveryKeys: readonly string[]
}): Promise<void> {
  await using transaction = await beginTransaction()
  if (input.edgeHighWater !== undefined)
    await transaction(sql`/* fenceTestMediaDeliveryRegistry:sequence */
      SELECT setval('media_delivery_registry_generation_sequence',
        GREATEST(${input.edgeHighWater}::bigint,
          (SELECT last_value FROM media_delivery_registry_generation_sequence)))
    `)
  await transaction(sql`/* fenceTestMediaDeliveryRegistry:reopen */
    UPDATE media_delivery_registry_records
    SET generation = generation + 1
    WHERE delivery_key = ANY(${input.reopenDeliveryKeys}::text[])
  `)
  await transaction.commit()
}

export async function withLockedTestMediaDeliveryRecord<T>(
  deliveryKey: string,
  run: () => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  await transaction(
    sql`SELECT delivery_key FROM media_delivery_registry_current_records WHERE delivery_key = ${deliveryKey} FOR UPDATE`,
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
