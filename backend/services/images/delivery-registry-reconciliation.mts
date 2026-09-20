import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'

const CLAIM_TIMEOUT_MS = 5 * 60 * 1000

export async function replayFailedMediaDeliveryRegistryRecords(input?: {
  actorUserId?: string
}): Promise<number> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ delivery_key: string; placement_id: string | null }>(sql`
    /* replayFailedMediaDeliveryRegistryRecords */
    UPDATE media_delivery_registry_records
    SET state = 'pending', delivery_attempt_count = 0, claimed_at = NULL, completed_at = NULL,
      next_attempt_at = NULL, failure_message = 'Reopened by media delivery reconciliation.'
    WHERE state = 'failed'
    RETURNING delivery_key, placement_id
  `)
  if (input?.actorUserId) {
    for (const record of rows) {
      // oxlint-disable-next-line no-await-in-loop -- each affected case receives immutable operator evidence.
      await transaction(sql`/* replayFailedMediaDeliveryRegistryRecords:event */
        INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
        SELECT target.copyright_notice_id, 'media_delivery_registry_replayed', ${input.actorUserId},
          ${JSON.stringify({ deliveryKey: record.delivery_key, reason: 'operator_replay' })}::jsonb
        FROM copyright_notice_targets target
        WHERE ${record.placement_id}::uuid IS NOT NULL
          AND target.placement_key = concat('image-placement:', ${record.placement_id}::uuid)
      `)
    }
  }
  await transaction.commit()
  return rows.length
}

export async function listRecoverableMediaDeliveryRegistryKeys(
  limit: number,
  now: Date,
): Promise<string[]> {
  const { rows } = await read<{
    delivery_key: string
  }>(sql`/* listRecoverableMediaDeliveryRegistryKeys */
    SELECT delivery_key FROM media_delivery_registry_records
    WHERE (state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ${now}))
      OR (state = 'claimed' AND claimed_at <= ${new Date(now.getTime() - CLAIM_TIMEOUT_MS)})
    ORDER BY COALESCE(next_attempt_at, claimed_at, created_at), delivery_key LIMIT ${limit}
  `)
  return rows.map(row => row.delivery_key)
}

export async function stageAllCurrentImagePlacementDeliveryRecords(): Promise<number> {
  await using transaction = await beginTransaction()
  const withheldUnsafeCount = await withholdUnsafeMediaDeliveryRegistryRecords(transaction)
  const { rows } = await transaction<{ count: string }>(sql`
    /* stageAllCurrentImagePlacementDeliveryRecords */
    WITH staged_placements AS (
      INSERT INTO media_delivery_registry_records (
        delivery_key, media_kind, route_kind, placement_id, placement_revision, asset_id, desired_state
      )
      SELECT concat('image-placement:', placement.id, ':', placement.revision, ':', binding.image_id),
        'image', 'placement', placement.id, placement.revision, binding.image_id,
        CASE WHEN placement.copyright_withheld_at IS NULL AND NOT EXISTS (
          SELECT 1 FROM copyright_restrictions restriction
          JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
          WHERE target.placement_key = concat('image-placement:', placement.id)
            AND restriction.lifted_at IS NULL
        ) THEN 'allow' ELSE 'withheld' END
      FROM media_placements placement
      JOIN (
        SELECT placement_id, image_id FROM image_placements
        UNION ALL SELECT placement_id, image_id FROM image_surface_placements
      ) binding ON binding.placement_id = placement.id
      JOIN images image ON image.id = binding.image_id
      WHERE placement.retired_at IS NULL AND placement.copyright_withheld_at IS NULL
        AND image.deleted_at IS NULL AND image.upload_completed_at IS NOT NULL
        AND image.quarantine_pending_at IS NULL
        AND image.openai_omni_moderation_flagged = FALSE
        AND image.openai_omni_moderation_results IS NOT NULL
        AND image.openai_omni_moderation_created_at IS NOT NULL
      ON CONFLICT (delivery_key) DO UPDATE
      SET desired_state = EXCLUDED.desired_state,
        state = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN 'pending' ELSE media_delivery_registry_records.state END,
        claimed_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN NULL ELSE media_delivery_registry_records.claimed_at END,
        completed_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN NULL ELSE media_delivery_registry_records.completed_at END,
        delivery_attempt_count = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN 0 ELSE media_delivery_registry_records.delivery_attempt_count END,
        next_attempt_at = NULL, failure_message = NULL,
        generation = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN media_delivery_registry_records.generation + 1 ELSE media_delivery_registry_records.generation END
      RETURNING 1
    ), staged_legacy AS (
      INSERT INTO media_delivery_registry_records (
        delivery_key, media_kind, route_kind, asset_id, desired_state
      )
      SELECT concat('legacy-image:', image.id), 'image', 'legacy-image', image.id,
        CASE WHEN EXISTS (SELECT 1 FROM post_images attachment WHERE attachment.image_id = image.id)
          OR EXISTS (
            SELECT 1 FROM image_surface_placements surface
            JOIN media_placements placement ON placement.id = surface.placement_id
            WHERE surface.image_id = image.id AND placement.retired_at IS NULL
          ) THEN 'withheld' ELSE 'allow' END
      FROM images image
      WHERE image.deleted_at IS NULL AND image.upload_completed_at IS NOT NULL
        AND image.quarantine_pending_at IS NULL AND image.openai_omni_moderation_flagged = FALSE
        AND image.openai_omni_moderation_results IS NOT NULL
        AND image.openai_omni_moderation_created_at IS NOT NULL
      ON CONFLICT (delivery_key) DO UPDATE
      SET desired_state = EXCLUDED.desired_state,
        state = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN 'pending' ELSE media_delivery_registry_records.state END,
        claimed_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN NULL ELSE media_delivery_registry_records.claimed_at END,
        completed_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN NULL ELSE media_delivery_registry_records.completed_at END,
        delivery_attempt_count = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN 0 ELSE media_delivery_registry_records.delivery_attempt_count END,
        next_attempt_at = NULL, failure_message = NULL,
        generation = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM EXCLUDED.desired_state
          THEN media_delivery_registry_records.generation + 1 ELSE media_delivery_registry_records.generation END
      RETURNING 1
    ) SELECT ((SELECT count(*) FROM staged_placements) + (SELECT count(*) FROM staged_legacy))::text AS count
  `)
  await transaction.commit()
  return withheldUnsafeCount + Number(rows[0]?.count ?? 0)
}

async function withholdUnsafeMediaDeliveryRegistryRecords(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<number> {
  const { rowCount } = await transaction(sql`
    /* withholdUnsafeMediaDeliveryRegistryRecords */
    UPDATE media_delivery_registry_records record
    SET desired_state = 'withheld', state = 'pending', claimed_at = NULL, completed_at = NULL,
      projected_at = NULL, invalidated_at = NULL, next_attempt_at = NULL, failure_message = NULL,
      delivery_attempt_count = 0, generation = record.generation + 1
    WHERE record.desired_state = 'allow'
      AND (
        (record.route_kind = 'placement' AND NOT EXISTS (
          SELECT 1
          FROM media_placements placement
          JOIN (
            SELECT placement_id, image_id FROM image_placements
            UNION ALL SELECT placement_id, image_id FROM image_surface_placements
          ) binding ON binding.placement_id = placement.id
          JOIN images image ON image.id = binding.image_id
          WHERE placement.id = record.placement_id
            AND placement.revision = record.placement_revision
            AND binding.image_id = record.asset_id
            AND placement.retired_at IS NULL
            AND placement.copyright_withheld_at IS NULL
            AND image.deleted_at IS NULL
            AND image.upload_completed_at IS NOT NULL
            AND image.quarantine_pending_at IS NULL
            AND image.openai_omni_moderation_flagged = FALSE
            AND image.openai_omni_moderation_results IS NOT NULL
            AND image.openai_omni_moderation_created_at IS NOT NULL
        ))
        OR (record.route_kind = 'legacy-image' AND NOT EXISTS (
          SELECT 1
          FROM images image
          WHERE image.id = record.asset_id
            AND image.deleted_at IS NULL
            AND image.upload_completed_at IS NOT NULL
            AND image.quarantine_pending_at IS NULL
            AND image.openai_omni_moderation_flagged = FALSE
            AND image.openai_omni_moderation_results IS NOT NULL
            AND image.openai_omni_moderation_created_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM post_images attachment WHERE attachment.image_id = image.id)
            AND NOT EXISTS (
              SELECT 1
              FROM image_surface_placements surface
              JOIN media_placements placement ON placement.id = surface.placement_id
              WHERE surface.image_id = image.id AND placement.retired_at IS NULL
            )
        ))
      )
  `)
  return rowCount ?? 0
}
