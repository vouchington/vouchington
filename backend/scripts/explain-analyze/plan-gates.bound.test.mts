import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'

async function loadGates() {
  vi.resetModules()
  const gates = await import('./plan-gates.mts')
  const expectations = await import('./plan-expectations.mts')
  return { ...gates, ...expectations }
}

function result(
  scenarioId: string,
  node: Record<string, unknown>,
  query = 'SELECT id FROM posts',
): ExplainResult {
  return {
    name: 'capturedQuery',
    scenario_id: scenarioId,
    query_text: query,
    plan: { Plan: { 'Node Type': 'Result', 'Actual Rows': 1, 'Actual Loops': 1, Plans: [node] } },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
  }
}

describe('media replay read budgets', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('excludes inserted rows while rejecting excess history reads', async () => {
    const { assertRequiredPlanShape, registerScenarioContract } = await loadGates()
    registerScenarioContract('media-delivery-replay-first', {
      expectations: [{ kind: 'custom', name: 'mediaDeliveryReplay' }],
      seededRows: { media_delivery_registry_changes: 24000 },
    })
    const history = {
      'Node Type': 'Index Scan',
      'Relation Name': 'media_delivery_registry_changes',
      'Actual Rows': 1,
      'Actual Loops': 1000,
    }
    const authority = {
      'Node Type': 'Index Scan',
      'Relation Name': 'media_delivery_registry_records',
      'Index Name': 'media_delivery_registry_records_pkey',
      'Actual Rows': 1,
      'Actual Loops': 1000,
    }
    const boundQuery = `/* replayFailedMediaDeliveryRegistryRecords */
      WITH inserted AS (
      INSERT INTO media_delivery_registry_changes
      SELECT id FROM unnest($2::uuid[]) selected(record_id)
      CROSS JOIN LATERAL (
        SELECT media_delivery_registry_record_id
        FROM view_media_delivery_registry_current_records
        WHERE media_delivery_registry_record_id = selected.record_id LIMIT 1
      ) current_record) SELECT id FROM inserted`
    const captured = result(
      'media-delivery-replay-first',
      {
        'Node Type': 'ModifyTable',
        Operation: 'Insert',
        'Relation Name': 'media_delivery_registry_changes',
        'Actual Rows': 1000,
        'Actual Loops': 1,
        Plans: [
          history,
          authority,
          { 'Node Type': 'Index Scan', 'Relation Name': 'users', 'Index Name': 'users_pkey' },
        ],
      },
      boundQuery,
    )
    expect(() => assertRequiredPlanShape(captured)).not.toThrow()
    captured.query_text =
      '/* replayFailedMediaDeliveryRegistryRecords */ SELECT id FROM media_delivery_registry_records'
    expect(() => assertRequiredPlanShape(captured)).toThrow('replay change insert')
    captured.query_text = boundQuery.replace('LIMIT 1', '')
    expect(() => assertRequiredPlanShape(captured)).toThrow('each locked UUID')
    captured.query_text = boundQuery
    history['Actual Loops'] = 1001
    expect(() => assertRequiredPlanShape(captured)).toThrow(
      'media_delivery_registry_changes driving-row budget',
    )
    history['Actual Loops'] = 1000
    authority['Node Type'] = 'Seq Scan'
    authority['Index Name'] = ''
    authority['Actual Rows'] = 17000
    authority['Actual Loops'] = 1
    expect(() => assertRequiredPlanShape(captured)).toThrow('probe only locked authority ids')

    const audit = result(
      'media-delivery-replay-first',
      {
        'Node Type': 'Index Scan',
        'Relation Name': 'media_delivery_registry_records',
        'Index Name': 'media_delivery_registry_records_pkey',
        'Actual Rows': 1,
        'Actual Loops': 1000,
      },
      '/* replayFailedMediaDeliveryRegistryRecords:event */ INSERT INTO copyright_notice_lifecycle_changes SELECT record.id FROM unnest($2::uuid[]) selected(record_id) CROSS JOIN LATERAL (SELECT id FROM media_delivery_registry_records WHERE id = selected.record_id LIMIT 1) record',
    )
    expect(() => assertRequiredPlanShape(audit)).not.toThrow()
    audit.query_text = audit.query_text.replace('unnest($2::uuid[])', 'unnest($3::uuid[])')
    expect(() => assertRequiredPlanShape(audit)).toThrow('each replayed UUID')
  })
})

describe('insert conflict arbiter', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('counts the conflict arbiter as the index an insert uses', async () => {
    const { registerScenarioContract, assertRequiredPlanShape } = await loadGates()
    registerScenarioContract('post-search-new', {
      expectations: [{ kind: 'usesIndexes', indexes: ['posts_pkey'] }],
    })
    expect(() =>
      assertRequiredPlanShape(
        result('post-search-new', {
          'Node Type': 'ModifyTable',
          'Conflict Arbiter Indexes': ['posts_pkey'],
          'Actual Rows': 1,
        }),
      ),
    ).not.toThrow()
  })
})

describe('no sequential scan expectation', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('rejects a scan that reads rows and ignores a different query', async () => {
    const { registerScenarioContract, assertRequiredPlanShape } = await loadGates()
    const query = 'WITH requested_posts AS (SELECT id) SELECT id FROM requested_posts'
    registerScenarioContract('post-metrics-batch', {
      expectations: [
        {
          kind: 'noSeqScan',
          relation: 'membership_verifications',
          queryContains: 'requested_posts',
        },
        { kind: 'maxProcessedRows', relation: 'membership_verifications', max: 1 },
      ],
      seededRows: { membership_verifications: 1 },
    })
    const indexScan = {
      'Node Type': 'Index Scan',
      'Relation Name': 'membership_verifications',
      'Index Name': 'membership_verifications_pkey',
      'Actual Rows': 1,
      'Actual Loops': 1,
    }
    expect(() =>
      assertRequiredPlanShape(result('post-metrics-batch', indexScan, query)),
    ).not.toThrow()
    expect(() =>
      assertRequiredPlanShape(
        result('post-metrics-batch', { ...indexScan, 'Node Type': 'Seq Scan' }, query),
      ),
    ).toThrow('sequentially scanned membership_verifications')
    expect(() =>
      assertRequiredPlanShape(
        result(
          'post-metrics-batch',
          { ...indexScan, 'Node Type': 'Seq Scan', 'Actual Rows': 0 },
          query,
        ),
      ),
    ).not.toThrow()
    expect(() =>
      assertRequiredPlanShape(
        result('post-metrics-batch', { ...indexScan, 'Node Type': 'Seq Scan' }, 'SELECT 1'),
      ),
    ).not.toThrow()
  })
})
