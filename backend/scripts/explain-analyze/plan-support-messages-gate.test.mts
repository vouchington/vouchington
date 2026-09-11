import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertSupportMessagesUseIndexOrder } from './plan-support-messages-gate.mts'

function result(scenarioId: string, plan: unknown): ExplainResult {
  return {
    name: scenarioId,
    scenario_id: scenarioId,
    query_text: 'SELECT FROM support_messages',
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

describe('support-message EXPLAIN plan gate', () => {
  it.each([
    'support-messages-page',
    'support-messages-page-after',
    'support-messages-page-at-or-before',
    'support-draft-generation-reservation',
    'support-agent-run-finalize',
  ])('requires %s to use UUIDv7 index order without a sort', scenarioId => {
    expect(() =>
      assertSupportMessagesUseIndexOrder(
        result(scenarioId, {
          Plan: {
            'Node Type': 'Nested Loop',
            Plans: [
              {
                'Node Type': 'Index Scan',
                'Relation Name': 'support_messages',
                'Index Name': 'uq_support_messages__thread_id',
              },
            ],
          },
        }),
      ),
    ).not.toThrow()
    expect(() =>
      assertSupportMessagesUseIndexOrder(
        result(scenarioId, {
          Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'support_messages' },
        }),
      ),
    ).toThrow('uq_support_messages__thread_id')
    expect(() =>
      assertSupportMessagesUseIndexOrder(
        result(scenarioId, {
          Plan: {
            'Node Type': 'Sort',
            Plans: [{ 'Node Type': 'Index Scan', 'Index Name': 'uq_support_messages__thread_id' }],
          },
        }),
      ),
    ).toThrow('without an explicit Sort')
  })

  it('rejects a wrong outer support-message access despite an indexed anchor lookup', () => {
    expect(() =>
      assertSupportMessagesUseIndexOrder(
        result('support-messages-page-after', {
          Plan: {
            'Node Type': 'Nested Loop',
            Plans: [
              {
                'Node Type': 'Index Scan',
                'Relation Name': 'support_messages',
                'Index Name': 'uq_support_messages__thread_id',
              },
              {
                'Node Type': 'Index Scan',
                'Relation Name': 'support_messages',
                'Index Name': 'idx_support_messages__search_vector',
              },
            ],
          },
        }),
      ),
    ).toThrow('uq_support_messages__thread_id')
  })

  it('allows the reservation draft lookup alongside the indexed latest inbound lookup', () => {
    expect(() =>
      assertSupportMessagesUseIndexOrder(
        result('support-draft-generation-reservation', {
          Plan: {
            'Node Type': 'Nested Loop',
            Plans: [
              {
                'Node Type': 'Index Scan',
                'Relation Name': 'support_messages',
                'Index Name': 'uq_support_messages__thread_id',
              },
              { 'Node Type': 'Seq Scan', 'Relation Name': 'support_messages' },
            ],
          },
        }),
      ),
    ).not.toThrow()
  })
})
