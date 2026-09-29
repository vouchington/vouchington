import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertRequiredPlanShape } from './plan-gates.mts'

function result(indexName: string, loops = 1): ExplainResult {
  return {
    name: 'searchAdminUsers:force_generic_plan',
    scenario_id: 'search-admin-users-email',
    query_text: '/* searchAdminUsers */ SELECT users.id FROM users',
    plan: {
      Plan: {
        'Node Type': 'Nested Loop',
        'Actual Rows': 1,
        'Actual Loops': 1,
        Plans: [
          {
            'Node Type': indexName ? 'Index Scan' : 'Seq Scan',
            'Relation Name': 'user_email_addresses',
            'Index Name': indexName,
            'Index Cond': '(email_address = $2)',
            'Actual Rows': 1,
            'Actual Loops': loops,
          },
        ],
      },
    },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-09-27T00:00:00.000Z',
  }
}

describe('admin email EXPLAIN gate', () => {
  it('accepts the executing selective primary-email index', () => {
    expect(() =>
      assertRequiredPlanShape(result('idx_user_email_addresses_email_primary')),
    ).not.toThrow()
  })

  it('rejects a sequential scan, another index, and an unexecuted email branch', () => {
    expect(() => assertRequiredPlanShape(result(''))).toThrow('primary-email index')
    expect(() => assertRequiredPlanShape(result('idx_user_email_addresses__email'))).toThrow(
      'primary-email index',
    )
    expect(() =>
      assertRequiredPlanShape(result('idx_user_email_addresses_email_primary', 0)),
    ).toThrow('primary-email index')
  })
})
