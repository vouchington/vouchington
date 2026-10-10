import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestImage } from './entities/images-insert.mts'
import { insertTestPost } from './entities/posts.mts'
import { insertTestPostImage } from './entities/images.mts'
import { getTestPostImagePlacement } from './entities/post-images.mts'
import {
  failExpiredExhaustedMediaDeliveryRegistryRecords,
  getMediaDeliveryRegistryScanBefore,
  listRecoverableMediaDeliveryRegistryIds,
  stageImagePlacementDeliveryRecord,
} from '../services/media-delivery-safety/index.mts'

export async function withTestMediaRecoveryBacklog<T>(
  userId: string,
  count: number,
  run: (fixture: {
    recordIds: string[]
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
  const recordIds = records.map(record => record.mediaDeliveryRegistryRecordId).toSorted()
  return run({
    recordIds,
    placements,
    scanBefore: await getMediaDeliveryRegistryScanBefore(),
  })
}

export async function setTestMediaRecoveryState(
  recordIds: readonly string[],
  input: {
    state: 'pending' | 'claimed' | 'completed' | 'failed'
    attempts: number
    at: string
    nextAttemptAt?: string
  },
): Promise<void> {
  await write(sql`/* setTestMediaRecoveryState */
    INSERT INTO media_delivery_registry_changes(media_delivery_registry_record_id, generation, change_type, delivery_attempt_count,
      claimed_at, completed_at, next_attempt_at, failure_message)
    SELECT media_delivery_registry_record_id, generation, ${input.state}::media_delivery_registry_change_types, ${input.attempts},
      CASE WHEN ${input.state} = 'pending' THEN NULL ELSE ${input.at}::timestamptz END,
      CASE WHEN ${input.state} IN ('completed', 'failed') THEN ${input.at}::timestamptz ELSE NULL END,
      ${input.nextAttemptAt ?? null}::timestamptz, 'Owned recovery failure evidence'
    FROM view_media_delivery_registry_current_records
    WHERE media_delivery_registry_record_id = ANY(${recordIds}::uuid[])
  `)
  if (input.state === 'claimed')
    await write(sql`/* setTestMediaRecoveryState:lease */
      UPDATE media_delivery_registry_projection_work_items
      SET lease_token = ${crypto.randomUUID()}::uuid, leased_at = ${input.at}::timestamptz,
        lease_expires_at = ${input.at}::timestamptz + interval '5 minutes', attempt_count = ${input.attempts}
      WHERE media_delivery_registry_record_id = ANY(${recordIds}::uuid[])
    `)
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
  reopenRecordIds: readonly string[]
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
    WHERE id = ANY(${input.reopenRecordIds}::uuid[])
  `)
  await transaction.commit()
}

export async function withLockedTestMediaDeliveryRecord<T>(
  mediaDeliveryRegistryRecordId: string,
  run: () => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  await transaction(
    sql`SELECT id FROM media_delivery_registry_records WHERE id = ${mediaDeliveryRegistryRecordId}::uuid FOR UPDATE`,
  )
  return await run()
}

/** Real production queries restricted to explicitly owned records; no substituted persistence. */
export function scopedTestMediaRecoveryDependencies(recordIds: readonly string[]) {
  return {
    listRecoverableMediaDeliveryRegistryIds: (
      input: Parameters<typeof listRecoverableMediaDeliveryRegistryIds>[0],
    ) => listRecoverableMediaDeliveryRegistryIds({ ...input, recordIds }),
    failExpiredExhaustedMediaDeliveryRegistryRecords: (now: string) =>
      failExpiredExhaustedMediaDeliveryRegistryRecords(now, recordIds),
  }
}
