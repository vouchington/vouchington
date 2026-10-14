import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertMediaDeliveryReplayPlan } from './media-delivery-replay.mts'

const prefix = 'replayFailedMediaDeliveryRegistryRecords'
const lockSql = `/* ${prefix}:lock */ WITH candidates AS MATERIALIZED (
  SELECT media_delivery_registry_record_id FROM media_delivery_registry_projection_work_items
  WHERE failed_change_id IS NOT NULL ORDER BY media_delivery_registry_record_id LIMIT $1
) SELECT record.id FROM candidates CROSS JOIN LATERAL (
  SELECT id FROM media_delivery_registry_records
  WHERE id = candidates.media_delivery_registry_record_id LIMIT 1
) record ORDER BY record.id FOR UPDATE OF record`
const writeSql = `/* ${prefix} */ WITH inserted AS (
  INSERT INTO media_delivery_registry_changes SELECT media_delivery_registry_record_id
  FROM unnest($2::uuid[]) selected(record_id) CROSS JOIN LATERAL (
    SELECT media_delivery_registry_record_id FROM view_media_delivery_registry_current_records
    WHERE media_delivery_registry_record_id = selected.record_id LIMIT 1
  ) current_record WHERE state = 'failed'
) SELECT media_delivery_registry_record_id FROM inserted`
const eventSql = `/* ${prefix}:event */ INSERT INTO copyright_notice_lifecycle_changes
  SELECT record.id FROM media_delivery_registry_records record
  WHERE record.id = ANY($2::uuid[])`

type ReplayStatement = 'lock' | 'write' | 'event'
type PlanMode = 'force_custom_plan' | 'force_generic_plan'

function captured(statement: ReplayStatement, mode: PlanMode): ExplainResult {
  const scans =
    statement === 'lock'
      ? [
          {
            'Node Type': 'Limit',
            'Subplan Name': 'CTE candidates',
            'Actual Rows': 1000,
            'Actual Loops': 1,
            Plans: [
              {
                'Node Type': 'Index Scan',
                'Relation Name': 'media_delivery_registry_projection_work_items',
                'Index Name': 'idx_media_delivery_registry_projection_work_items__failed',
                'Actual Rows': 1000,
                'Actual Loops': 1,
              },
            ],
          },
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'media_delivery_registry_records',
            'Index Name': 'media_delivery_registry_records_pkey',
            'Actual Rows': 1,
            'Actual Loops': 1000,
          },
        ]
      : statement === 'write'
        ? [
            {
              'Node Type': 'Index Scan',
              'Relation Name': 'media_delivery_registry_records',
              'Index Name': 'media_delivery_registry_records_pkey',
              'Actual Rows': 1,
              'Actual Loops': 1000,
            },
            {
              'Node Type': 'Index Scan',
              'Relation Name': 'media_delivery_registry_changes',
              'Actual Rows': 1,
              'Actual Loops': 1000,
            },
          ]
        : [
            {
              'Node Type': 'Bitmap Heap Scan',
              'Relation Name': 'media_delivery_registry_records',
              'Actual Rows': 1000,
              'Actual Loops': 1,
            },
          ]
  return {
    name: `${prefix}${statement === 'write' ? '' : `:${statement}`}:${mode}`,
    scenario_id: 'media-delivery-replay-first',
    query_text: statement === 'lock' ? lockSql : statement === 'write' ? writeSql : eventSql,
    plan: { Plan: { 'Node Type': 'Result', Plans: scans } },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-10-14T00:00:00.000Z',
  }
}

function scans(result: ExplainResult): Record<string, unknown>[] {
  return (result.plan as { Plan: { Plans: Record<string, unknown>[] } }).Plan.Plans
}

function scan(result: ExplainResult, index: number): Record<string, unknown> {
  return scans(result)[index]!
}

describe('media replay captured statement budgets', () => {
  it.each<PlanMode>(['force_custom_plan', 'force_generic_plan'])(
    'accepts the bounded lock, main write, and replayed-id audit in %s',
    mode => {
      for (const statement of ['lock', 'write', 'event'] as const)
        expect(() => assertMediaDeliveryReplayPlan(captured(statement, mode))).not.toThrow()
    },
  )

  it('does not let the event bitmap budget classify a mislabeled main write', () => {
    const write = captured('write', 'force_custom_plan')
    write.query_text = write.query_text
      .replace(`/* ${prefix} */`, `/* ${prefix}:event */`)
      .concat(' WHERE record.id = ANY($2::uuid[])')
    expect(() => assertMediaDeliveryReplayPlan(write)).toThrow('actor-audit event insert')
    const event = captured('event', 'force_custom_plan')
    event.query_text = event.query_text.replace(`/* ${prefix}:event */`, `/* ${prefix} */`)
    expect(() => assertMediaDeliveryReplayPlan(event)).toThrow('replay change insert')
    const lock = captured('lock', 'force_custom_plan')
    lock.query_text = lock.query_text.replace(`/* ${prefix}:lock */`, `/* ${prefix}:event */`)
    expect(() => assertMediaDeliveryReplayPlan(lock)).toThrow('actor-audit event insert')
  })

  it('rejects wrong locked or replayed array bindings', () => {
    const write = captured('write', 'force_generic_plan')
    write.query_text = write.query_text.replace('unnest($2::uuid[])', 'unnest($3::uuid[])')
    expect(() => assertMediaDeliveryReplayPlan(write)).toThrow('each locked UUID')
    const event = captured('event', 'force_generic_plan')
    event.query_text = event.query_text.replace(
      'record.id = ANY($2::uuid[])',
      'record.id = ANY($3::uuid[])',
    )
    expect(() => assertMediaDeliveryReplayPlan(event)).toThrow('actor audit to replayed UUIDs')
  })

  it('rejects an authority full scan, even alongside a valid unrelated primary-key probe', () => {
    const write = captured('write', 'force_custom_plan')
    Object.assign(scan(write, 0), {
      'Node Type': 'Seq Scan',
      'Actual Rows': 17000,
      'Actual Loops': 1,
    })
    scans(write).splice(0, 2, scan(write, 0), {
      'Node Type': 'Index Scan',
      'Relation Name': 'users',
      'Index Name': 'users_pkey',
    })
    expect(() => assertMediaDeliveryReplayPlan(write)).toThrow('probe only locked authority ids')
    const event = captured('event', 'force_generic_plan')
    Object.assign(scan(event, 0), { 'Node Type': 'Seq Scan', 'Actual Rows': 17000 })
    expect(() => assertMediaDeliveryReplayPlan(event)).toThrow('driving-row budget')
  })

  it('keeps the locked page, primary-key probes, history, and event row budgets separate', () => {
    const lock = captured('lock', 'force_custom_plan')
    scan(lock, 0)['Actual Rows'] = 1001
    expect(() => assertMediaDeliveryReplayPlan(lock)).toThrow(
      'one full bounded UUID candidate page',
    )
    const flattenedLock = captured('lock', 'force_custom_plan')
    flattenedLock.query_text = flattenedLock.query_text.replace('CROSS JOIN LATERAL (', 'JOIN (')
    expect(() => assertMediaDeliveryReplayPlan(flattenedLock)).toThrow('bounded candidate page')
    const unboundedLock = captured('lock', 'force_generic_plan')
    Object.assign(scan(unboundedLock, 1), {
      'Node Type': 'Seq Scan',
      'Index Name': undefined,
      'Actual Rows': 17000,
      'Actual Loops': 1,
    })
    expect(() => assertMediaDeliveryReplayPlan(unboundedLock)).toThrow('bounded authority page')
    const write = captured('write', 'force_custom_plan')
    scan(write, 0)['Actual Loops'] = 1001
    expect(() => assertMediaDeliveryReplayPlan(write)).toThrow('probe only locked authority ids')
    const history = captured('write', 'force_custom_plan')
    scan(history, 1)['Actual Loops'] = 1001
    expect(() => assertMediaDeliveryReplayPlan(history)).toThrow('driving-row budget')
    const event = captured('event', 'force_custom_plan')
    scan(event, 0)['Actual Rows'] = 2001
    expect(() => assertMediaDeliveryReplayPlan(event)).toThrow('driving-row budget')
    const twoEventScans = captured('event', 'force_generic_plan')
    scans(twoEventScans).push({
      'Node Type': 'Index Scan',
      'Relation Name': 'media_delivery_registry_records',
      'Index Name': 'media_delivery_registry_records_pkey',
      'Actual Rows': 1001,
      'Actual Loops': 1,
    })
    expect(() => assertMediaDeliveryReplayPlan(twoEventScans)).toThrow('driving-row budget')
  })
})
