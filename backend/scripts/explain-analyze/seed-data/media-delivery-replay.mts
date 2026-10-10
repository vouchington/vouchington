import { beginTransaction, write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

import {
  MEDIA_REPLAY_RECORD_COUNT,
  MEDIA_REPLAY_FAILED_COUNT,
  MEDIA_REPLAY_PAGE_SIZE,
  MEDIA_REPLAY_ACTOR_ID,
  MEDIA_REPLAY_NOTICE_ID,
  mediaReplayRecordIds,
  mediaReplayFailedIds,
} from './media-delivery-replay-cohort.mts'
export * from './media-delivery-replay-cohort.mts'
const BATCH_SIZE = 250

/** Representative tooling fixture; all real canonical constraints and triggers stay enabled. */
export async function seedMediaDeliveryReplay(): Promise<void> {
  {
    await using transaction = await beginTransaction()
    await transaction(
      `/* seedMediaDeliveryReplay:actor */
    INSERT INTO users (id, username) VALUES ($1, 'seed-media-replay-actor')
    ON CONFLICT (id) DO NOTHING`,
      [MEDIA_REPLAY_ACTOR_ID],
    )
    await transaction(
      `/* seedMediaDeliveryReplay:notice */
    INSERT INTO copyright_notices
      (id, jurisdiction, legal_basis, received_at, claimant_user_id,
       claimant_contact_ciphertext, work_description, policy_version)
    VALUES ($1, 'us_dmca', 'copyright', '2026-07-01T12:00:00Z', $2,
      'synthetic-ciphertext', 'EXPLAIN UUID replay fixture', 'explain-fixture')
    ON CONFLICT (id) DO NOTHING`,
      [MEDIA_REPLAY_NOTICE_ID, MEDIA_REPLAY_ACTOR_ID],
    )
    await transaction.commit()
  }
  for (let start = 0; start < MEDIA_REPLAY_RECORD_COUNT; start += BATCH_SIZE) {
    await using transaction = await beginTransaction()
    const imageIds: string[] = []
    const placementIds: string[] = []
    const recordIds: string[] = []
    const targetIds: string[] = []
    for (
      let index = start;
      index < Math.min(start + BATCH_SIZE, MEDIA_REPLAY_RECORD_COUNT);
      index++
    ) {
      imageIds.push(seedUuid(index, 'fd'))
      // Reverse placement/edge-key order relative to the replay authority UUIDs.
      placementIds.push(seedUuid(MEDIA_REPLAY_RECORD_COUNT - index - 1, 'fc'))
      recordIds.push(seedUuid(index, 'fe'))
      targetIds.push(seedUuid(index, 'ff'))
    }
    await transaction(
      `/* seedMediaDeliveryReplay:images */
      INSERT INTO retained_image_identities (id, created_by_id)
      SELECT id, $2::uuid FROM unnest($1::uuid[]) id
      ORDER BY id ON CONFLICT (id) DO NOTHING`,
      [imageIds, MEDIA_REPLAY_ACTOR_ID],
    )
    await transaction(
      `/* seedMediaDeliveryReplay:bindings */
      INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
      SELECT placement_id, image_id, 'post' FROM unnest($1::uuid[], $2::uuid[]) seed(placement_id, image_id)
      ORDER BY placement_id ON CONFLICT (placement_id) DO NOTHING`,
      [placementIds, imageIds],
    )
    await transaction(
      `/* seedMediaDeliveryReplay:placements */
      INSERT INTO media_placements (id) SELECT id FROM unnest($1::uuid[]) id
      ORDER BY id ON CONFLICT (id) DO NOTHING`,
      [placementIds],
    )
    await transaction(
      `/* seedMediaDeliveryReplay:records */
      INSERT INTO media_delivery_registry_records (id, placement_id, placement_revision, image_id, desired_state)
      SELECT id, placement_id, 0, image_id, 'withheld'
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) seed(id, placement_id, image_id)
      ORDER BY id ON CONFLICT (id) DO NOTHING`,
      [recordIds, placementIds, imageIds],
    )
    await transaction(
      `/* seedMediaDeliveryReplay:targets */
      INSERT INTO copyright_notice_targets
        (id, copyright_notice_id, placement_id, placement_revision, hosted_use_url)
      SELECT id, $3::uuid, placement_id, 0, 'https://example.test/explain-media-replay/' || id::text
      FROM unnest($1::uuid[], $2::uuid[]) seed(id, placement_id)
      ORDER BY id ON CONFLICT (id) DO NOTHING`,
      [targetIds, placementIds, MEDIA_REPLAY_NOTICE_ID],
    )
    if (start === 0)
      await transaction(`/* seedMediaDeliveryReplay:firstBatchStatistics */ ANALYZE
        media_delivery_registry_records, media_delivery_registry_changes,
        media_delivery_registry_projection_work_items, retained_image_identities,
        retained_image_placement_bindings, media_placements, copyright_notice_targets`)
    await transaction.commit()
  }
  const failedIds = mediaReplayFailedIds()
  for (let start = 0; start < failedIds.length; start += BATCH_SIZE)
    await rearmMediaDeliveryReplayPage(failedIds.slice(start, start + BATCH_SIZE))
  await analyzeMediaDeliveryReplayRelations()
  await assertMediaDeliveryReplayPopulation()
}

/** New failed cycles only for this fixture's bounded page; never reset or delete other owners. */
export async function rearmMediaDeliveryReplayPage(ids: readonly string[]): Promise<void> {
  const owned = new Set(mediaReplayFailedIds())
  if (ids.length > MEDIA_REPLAY_PAGE_SIZE || ids.some(id => !owned.has(id)))
    throw new Error('Media replay rearm must be a bounded owned page')
  await write(
    `/* rearmMediaDeliveryReplayPage */
    INSERT INTO media_delivery_registry_changes
      (media_delivery_registry_record_id, generation, change_type, completed_at, failure_message)
    SELECT media_delivery_registry_record_id, generation, 'failed', '2026-07-01T12:00:00Z',
      'Synthetic EXPLAIN provider failure'
    FROM view_media_delivery_registry_current_records
    WHERE media_delivery_registry_record_id = ANY($1::uuid[]) AND state <> 'failed'
    ORDER BY media_delivery_registry_record_id`,
    [ids],
  )
}

/** Includes current-view, lifecycle join, retained-actor and FK/trigger partners. */
export async function analyzeMediaDeliveryReplayRelations(): Promise<void> {
  await write(`/* analyzeMediaDeliveryReplayRelations */ ANALYZE
    media_delivery_registry_projection_work_items, media_delivery_registry_records,
    media_delivery_registry_changes, copyright_notice_targets, copyright_notices,
    copyright_notice_lifecycle_changes, users, retained_user_identities,
    media_placements, retained_image_placement_bindings, retained_image_identities`)
}

export async function assertMediaDeliveryReplayPopulation() {
  const { rows } = await write<{
    records: number
    failed: number
    pending: number
    targets: number
    fingerprint: string
  }>(
    `/* assertMediaDeliveryReplayPopulation */
    SELECT count(*)::integer AS records,
      count(*) FILTER (WHERE work.failed_change_id IS NOT NULL)::integer AS failed,
      count(*) FILTER (WHERE work.failed_change_id IS NULL)::integer AS pending,
      count(target.id)::integer AS targets,
      md5(string_agg(record.id::text || ':' || record.placement_id::text || ':' ||
        record.image_id::text || ':' || record.generation::text || ':' || record.desired_state::text,
        ',' ORDER BY record.id)) AS fingerprint
    FROM media_delivery_registry_records record
    JOIN media_delivery_registry_projection_work_items work ON work.media_delivery_registry_record_id = record.id
    JOIN copyright_notice_targets target ON target.placement_id = record.placement_id
      AND target.copyright_notice_id = $2::uuid
    WHERE record.id = ANY($1::uuid[])`,
    [mediaReplayRecordIds(), MEDIA_REPLAY_NOTICE_ID],
  )
  const population = rows[0]
  if (
    population?.records !== MEDIA_REPLAY_RECORD_COUNT ||
    population.failed !== MEDIA_REPLAY_FAILED_COUNT ||
    population.pending !== MEDIA_REPLAY_RECORD_COUNT - MEDIA_REPLAY_FAILED_COUNT ||
    population.targets !== MEDIA_REPLAY_RECORD_COUNT
  )
    throw new Error(`Media replay population mismatch: ${JSON.stringify(population)}`)
  return population
}
