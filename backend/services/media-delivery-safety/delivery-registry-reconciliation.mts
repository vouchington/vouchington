import { getMediaDeliverySafetyWorkLimit } from './work-limits.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import { stageImagePlacementDeliveryRecordPage } from './delivery-registry-staging-page.mts'

export async function replayFailedMediaDeliveryRegistryRecords(input?: {
  actorUserId?: string
  recordIds?: readonly string[]
  after?: string
}): Promise<{ replayed: number; after?: string; hasMore: boolean }> {
  if (input?.recordIds?.length === 0) return { replayed: 0, hasMore: false }
  observeSharedDbScope(
    'replayFailedMediaDeliveryRegistryRecords',
    sharedDbIdsScope(input?.recordIds),
  )
  const recordIds = input?.recordIds ? [...input.recordIds] : null
  await using transaction = await beginTransaction()
  const limit = getMediaDeliverySafetyWorkLimit('registry_reconciliation_page_size')
  const { rows: locked } = await transaction<{ id: string; delivery_key: string }>(sql`
    /* replayFailedMediaDeliveryRegistryRecords:lock */
    SELECT record.id, ('image-placement:' || record.placement_id::text || ':' || record.placement_revision::text || ':' || record.image_id::text) AS delivery_key FROM media_delivery_registry_records record
    JOIN LATERAL (SELECT history.change_type, history.generation
      FROM media_delivery_registry_changes history
      WHERE history.media_delivery_registry_record_id = record.id
      ORDER BY history.id DESC LIMIT 1) latest ON true
    WHERE latest.change_type = 'failed' AND latest.generation = record.generation
      AND (${recordIds}::uuid[] IS NULL OR record.id = ANY(${recordIds}::uuid[]))
      AND (${input?.after ?? null}::text IS NULL OR ('image-placement:' || record.placement_id::text || ':' || record.placement_revision::text || ':' || record.image_id::text) > ${input?.after ?? null})
    ORDER BY delivery_key LIMIT ${limit} FOR UPDATE OF record
  `)
  const ids = locked.map(record => record.id)
  const { rows } = await transaction<{
    media_delivery_registry_record_id: string
    placement_id: string
  }>(sql`
    /* replayFailedMediaDeliveryRegistryRecords */
    WITH inserted AS (
      INSERT INTO media_delivery_registry_changes(media_delivery_registry_record_id, generation, change_type, changed_by_id, failure_message)
      SELECT media_delivery_registry_record_id, generation, 'pending', ${input?.actorUserId ?? null}, 'Reopened by media delivery reconciliation.'
      FROM view_media_delivery_registry_current_records
      WHERE media_delivery_registry_record_id = ANY(${ids}::uuid[]) AND state = 'failed'
      ORDER BY media_delivery_registry_record_id
      RETURNING media_delivery_registry_record_id
    ) SELECT record.id AS media_delivery_registry_record_id, record.placement_id FROM inserted
      JOIN media_delivery_registry_records record ON record.id = inserted.media_delivery_registry_record_id
  `)
  if (input?.actorUserId) {
    for (const record of rows) {
      // oxlint-disable-next-line no-await-in-loop -- each case receives immutable operator evidence.
      await transaction(sql`/* replayFailedMediaDeliveryRegistryRecords:event */
        INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
          media_delivery_registry_record_id, replay_reason)
        SELECT target.copyright_notice_id, 'media_delivery_registry_replayed', ${input.actorUserId},
          ${record.media_delivery_registry_record_id}, 'operator_replay'
        FROM copyright_notice_targets target
        WHERE ${record.placement_id}::uuid IS NOT NULL
          AND target.placement_id = ${record.placement_id}::uuid
      `)
    }
  }
  await transaction.commit()
  return {
    replayed: rows.length,
    hasMore: locked.length === limit,
    after: locked.at(-1)?.delivery_key,
  }
}

/** @public Scoped reconciliation seam exercised against real PostgreSQL delivery records. */
export async function stageCurrentImagePlacementDeliveryRecordsForImageIds(
  imageIds: readonly string[],
): Promise<number> {
  if (imageIds.length === 0) return 0
  return stageAllCurrentImagePlacementDeliveryRecords(imageIds)
}

/** Snapshot staging is advisory; the publisher repeats the proof under retained locks. */
export async function stageAllCurrentImagePlacementDeliveryRecords(
  imageIds?: readonly string[],
): Promise<number> {
  const page = await stageImagePlacementDeliveryRecordPage({ imageIds })
  return page.staged
}

export { stageImagePlacementDeliveryRecordPage } from './delivery-registry-staging-page.mts'
