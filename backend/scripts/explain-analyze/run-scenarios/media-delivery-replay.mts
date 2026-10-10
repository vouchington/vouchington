import { write } from '@data-stores/psql'
import {
  decodeScopedUuidCursor,
  encodeScopedUuidCursor,
} from '../../../modules/pagination/index.mts'
import { replayFailedMediaDeliveryRegistryRecords } from '@services/media-delivery-safety/delivery-registry-reconciliation'
import {
  getMediaDeliverySafetyWorkLimit,
  mediaDeliverySafetyWorkConfig,
} from '@services/media-delivery-safety/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  analyzeMediaDeliveryReplayRelations,
  assertMediaDeliveryReplayPopulation,
  MEDIA_REPLAY_ACTOR_ID,
  MEDIA_REPLAY_PAGE_SIZE,
  MEDIA_REPLAY_RECORD_COUNT,
  MEDIA_REPLAY_NOTICE_ID,
  mediaReplayFailedIds,
  rearmMediaDeliveryReplayPage,
} from '../seed-data/media-delivery-replay.mts'

export const MEDIA_REPLAY_SCENARIOS = [
  'media-delivery-replay-first',
  'media-delivery-replay-continuation',
  'media-delivery-replay-scoped',
] as const
const QUERY_NAMES = [
  'replayFailedMediaDeliveryRegistryRecords:lock',
  'replayFailedMediaDeliveryRegistryRecords',
  'replayFailedMediaDeliveryRegistryRecords:event',
] as const

export async function runMediaDeliveryReplayScenarios() {
  const effects: {
    scenario: string
    beforeAudit: number
    afterAudit: number
    lastRecordId: string
    replayed: number
  }[] = []
  await mediaDeliverySafetyWorkConfig.waitForInitialization()
  if (
    getMediaDeliverySafetyWorkLimit('registry_reconciliation_page_size') !== MEDIA_REPLAY_PAGE_SIZE
  )
    throw new Error(
      'The representative media replay scenario requires the canonical 1000-row page configuration',
    )
  await assertMediaDeliveryReplayPopulation()
  const failedIds = mediaReplayFailedIds()
  const cases = [
    {
      id: MEDIA_REPLAY_SCENARIOS[0],
      afterId: undefined,
      recordIds: undefined,
      expected: failedIds.slice(0, MEDIA_REPLAY_PAGE_SIZE),
    },
    {
      id: MEDIA_REPLAY_SCENARIOS[1],
      afterId: failedIds[MEDIA_REPLAY_PAGE_SIZE - 1],
      recordIds: undefined,
      expected: failedIds.slice(MEDIA_REPLAY_PAGE_SIZE, 2 * MEDIA_REPLAY_PAGE_SIZE),
    },
    {
      id: MEDIA_REPLAY_SCENARIOS[2],
      afterId: failedIds[99],
      recordIds: failedIds.slice(0, 1500),
      expected: failedIds.slice(100, 100 + MEDIA_REPLAY_PAGE_SIZE),
    },
  ]
  for (const scenario of cases) {
    const scope = JSON.stringify({
      operation: 'media-delivery-registry-replay',
      order: 'media-delivery-registry-record-id-asc',
      recordIds: scenario.recordIds ?? null,
      actorUserId: MEDIA_REPLAY_ACTOR_ID,
    })
    // Verify global first/continuation pages contain only owned seeds before calling the service.
    await assertOwnedCandidatePage(scenario.afterId, scenario.recordIds, scenario.expected)
    registerScenarioContract(scenario.id, {
      expectations: [{ kind: 'custom', name: 'mediaDeliveryReplay' }],
      seededRows: {
        media_delivery_registry_projection_work_items: MEDIA_REPLAY_RECORD_COUNT,
        media_delivery_registry_records: MEDIA_REPLAY_RECORD_COUNT,
        media_delivery_registry_changes: 2 * MEDIA_REPLAY_RECORD_COUNT,
        copyright_notice_targets: MEDIA_REPLAY_RECORD_COUNT,
        copyright_notice_lifecycle_changes: 3 * MEDIA_REPLAY_PAGE_SIZE,
      },
    })
    await analyzeMediaDeliveryReplayRelations()
    const beforeAudit = await countOwnedReplayAuditEvents(scenario.expected)
    let replayResult:
      | Awaited<ReturnType<typeof replayFailedMediaDeliveryRegistryRecords>>
      | undefined
    await runAndCapture(
      scenario.id,
      async () => {
        replayResult = await replayFailedMediaDeliveryRegistryRecords({
          actorUserId: MEDIA_REPLAY_ACTOR_ID,
          recordIds: scenario.recordIds,
          after: scenario.afterId ? encodeScopedUuidCursor(scenario.afterId, scope) : undefined,
        })
      },
      undefined,
      QUERY_NAMES,
      {
        localSettings: { statement_timeout: '30000', lock_timeout: '5000' },
        exactCapturedNames: QUERY_NAMES,
        afterCapture: async () => {
          const result = replayResult
          if (!result) throw new Error(`Media replay ${scenario.id} returned no result`)
          if (
            result.replayed !== MEDIA_REPLAY_PAGE_SIZE ||
            !result.hasMore ||
            !result.after ||
            decodeScopedUuidCursor(result.after, scope, 'Invalid media replay cursor').id !==
              scenario.expected.at(-1)
          )
            throw new Error(`Media replay ${scenario.id} did not commit its exact full UUID page`)
          const { rows } = await write<{ pending: number; events: number }>(
            `/* assertMediaReplayPageEffects */
        SELECT (SELECT count(*)::integer FROM view_media_delivery_registry_current_records
          WHERE media_delivery_registry_record_id = ANY($1::uuid[]) AND state = 'pending') AS pending,
        (SELECT count(*)::integer FROM copyright_notice_lifecycle_changes
          WHERE copyright_notice_id = $2::uuid AND changed_by_id = $3::uuid
            AND media_delivery_registry_record_id = ANY($1::uuid[])
            AND change_type = 'media_delivery_registry_replayed') AS events`,
            [scenario.expected, MEDIA_REPLAY_NOTICE_ID, MEDIA_REPLAY_ACTOR_ID],
          )
          if (
            rows[0]?.pending !== MEDIA_REPLAY_PAGE_SIZE ||
            rows[0].events !== beforeAudit + MEDIA_REPLAY_PAGE_SIZE
          )
            throw new Error(
              'The captured replay page must persist pending transitions and actor lifecycle events',
            )
          effects.push({
            scenario: scenario.id,
            beforeAudit,
            afterAudit: rows[0].events,
            lastRecordId: decodeScopedUuidCursor(result.after, scope, 'Invalid media replay cursor')
              .id,
            replayed: result.replayed,
          })
          // Capture came from the actual committing service. Restore only its known seeded page so
          // every independently rolled-back EXPLAIN INSERT sees failed rows, not an empty plan.
          await rearmMediaDeliveryReplayPage(scenario.expected)
          await analyzeMediaDeliveryReplayRelations()
        },
      },
    )
  }
  await assertMediaDeliveryReplayPopulation()
  return effects
}

async function assertOwnedCandidatePage(
  after: string | undefined,
  recordIds: readonly string[] | undefined,
  expected: readonly string[],
): Promise<void> {
  const values: unknown[] = [MEDIA_REPLAY_PAGE_SIZE]
  let predicate = ''
  if (after) {
    values.push(after)
    predicate += ` AND media_delivery_registry_record_id > $${values.length}::uuid`
  }
  if (recordIds) {
    values.push(recordIds)
    predicate += ` AND media_delivery_registry_record_id = ANY($${values.length}::uuid[])`
  }
  const { rows } = await write<{ id: string }>(
    `/* assertOwnedMediaReplayCandidatePage */
    SELECT media_delivery_registry_record_id AS id FROM media_delivery_registry_projection_work_items
    WHERE failed_change_id IS NOT NULL${predicate}
    ORDER BY media_delivery_registry_record_id LIMIT $1`,
    values,
  )
  if (JSON.stringify(rows.map(row => row.id)) !== JSON.stringify(expected))
    throw new Error('Refusing a representative replay page that includes an unowned failed record')
}

async function countOwnedReplayAuditEvents(ids: readonly string[]): Promise<number> {
  const { rows } = await write<{ count: number }>(
    `/* countOwnedReplayAuditEvents */
    SELECT count(*)::integer AS count FROM copyright_notice_lifecycle_changes
    WHERE copyright_notice_id = $1::uuid AND changed_by_id = $2::uuid
      AND media_delivery_registry_record_id = ANY($3::uuid[])
      AND change_type = 'media_delivery_registry_replayed'`,
    [MEDIA_REPLAY_NOTICE_ID, MEDIA_REPLAY_ACTOR_ID, ids],
  )
  return rows[0]!.count
}
