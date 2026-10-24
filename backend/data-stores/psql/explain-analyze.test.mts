import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  createTestUsername,
  getTestPrivateUserById,
} from '@voucha/test-helpers'
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'

import { read } from './index.mts'
import {
  buildExplainAnalyzeText,
  buildExplainPreparedStatementText,
  explainAnalyze,
  functionCallsSince,
} from './explain-analyze.mts'

function rootPlan(result: Awaited<ReturnType<typeof explainAnalyze>>): Record<string, unknown> {
  return (result.plan as { Plan: Record<string, unknown> }).Plan
}

describe('buildExplainAnalyzeText', () => {
  it('excludes setup-time calls and orders equal-call functions by name', () => {
    expect(
      functionCallsSince(
        [{ funcid: '1', funcname: 'fn_before', calls: '2', total_time: 3, self_time: 2 }],
        [
          { funcid: '1', funcname: 'fn_before', calls: '2', total_time: 3, self_time: 2 },
          { funcid: '2', funcname: 'fn_target', calls: '3', total_time: 4, self_time: 3 },
          { funcid: '3', funcname: 'fn_alpha', calls: '3', total_time: 5, self_time: 4 },
        ],
      ),
    ).toEqual([
      { funcname: 'fn_alpha', calls: 3, total_time: 5, self_time: 4 },
      { funcname: 'fn_target', calls: 3, total_time: 4, self_time: 3 },
    ])
  })

  it('captures calls made by the explained statement and none from the next capture', async () => {
    const target = `/* explainFunctionCallsTest */
      SELECT fn_text_to_timestamptz('2026-01-0' || value::text || 'T00:00:00Z')
      FROM generate_series(1, 3) value`
    const first = await explainAnalyze('tracked-functions', target)
    const second = await explainAnalyze('no-functions', '/* explainFunctionCallsTest */ SELECT 1')
    expect(first.function_calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ funcname: 'fn_text_to_timestamptz', calls: 3 }),
      ]),
    )
    expect(second.function_calls).toEqual([])
  })

  it('captures WAL statistics alongside buffers', () => {
    expect(buildExplainAnalyzeText('SELECT 1')).toBe(
      'EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) SELECT 1',
    )
  })

  it('explains execution of a prepared target query so plan-cache mode applies to the target', () => {
    expect(buildExplainPreparedStatementText('target_query', ["'value'::text", '7::integer'])).toBe(
      "EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) EXECUTE target_query('value'::text, 7::integer)",
    )
    expect(buildExplainPreparedStatementText('target_query', [])).toBe(
      'EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) EXECUTE target_query',
    )
  })

  it('plans a prepared target without executing it when only the plan cost is wanted', async () => {
    expect(buildExplainPreparedStatementText('target_query', ['7::integer'], true)).toBe(
      'EXPLAIN (FORMAT JSON) EXECUTE target_query(7::integer)',
    )
    const planned = await explainAnalyze(
      'plan-only',
      '/* explainPlanOnlyTest */ SELECT $1::integer AS value',
      [7],
      { planOnly: true },
    )
    const plan = (planned.plan as { Plan: Record<string, unknown> }).Plan
    expect(plan['Node Type']).toBe('Result')
    expect(plan['Total Cost']).toEqual(expect.any(Number))
    expect(plan['Actual Rows']).toBeUndefined()
    expect(planned.execution_time_ms).toBe(0)
  })

  it('deallocates the prepared target after an EXPLAIN execution error', async () => {
    await expect(
      explainAnalyze('failing-target', '/* failingExplainTarget */ SELECT 1 / $1::integer', [0]),
    ).rejects.toThrow('division by zero')

    const { rows } = await read<{ count: number }>(
      `/* inspectFailingExplainCleanup */
        SELECT count(*)::integer AS count
        FROM pg_prepared_statements
        WHERE name LIKE 'explain_%'`,
    )
    expect(rows).toEqual([{ count: 0 }])
  })

  it('rejects prepared targets with mismatched parameter values', async () => {
    await expect(
      explainAnalyze('mismatched-target', '/* mismatchedExplainTarget */ SELECT $1::integer', []),
    ).rejects.toThrow('Prepared EXPLAIN parameter mismatch: expected 1, received 0')
  })

  it('rejects invalid JIT modes before acquiring an EXPLAIN client', async () => {
    const originalMode = process.env.EXPLAIN_JIT_MODE
    process.env.EXPLAIN_JIT_MODE = 'sometimes'
    try {
      await expect(explainAnalyze('invalid-jit', '/* invalidJit */ SELECT 1')).rejects.toThrow(
        'EXPLAIN_JIT_MODE must be "on" or "off", got "sometimes"',
      )
    } finally {
      if (originalMode === undefined) delete process.env.EXPLAIN_JIT_MODE
      else process.env.EXPLAIN_JIT_MODE = originalMode
    }
  })

  it('uses custom and generic plans for the prepared target parameter', async () => {
    const query = '/* explainPlanCacheTarget */ SELECT 1 WHERE $1::boolean'
    const custom = await explainAnalyze('custom-target', query, [false], {
      planCacheMode: 'force_custom_plan',
    })
    const generic = await explainAnalyze('generic-target', query, [false], {
      planCacheMode: 'force_generic_plan',
    })

    expect(rootPlan(custom)['One-Time Filter']).toBe('false')
    expect(rootPlan(generic)['One-Time Filter']).toMatch(/\$1/)
    expect(rootPlan(custom)['Actual Rows']).toBe(0)
    expect(rootPlan(generic)['Actual Rows']).toBe(0)
  })

  it('applies a transaction-local setting to the target and clears it afterward', async () => {
    const query = `/* explainLocalSetting */
      SELECT 1 WHERE current_setting('random_page_cost')::numeric > 999999`
    const before = await explainAnalyze('setting-before', query)
    const local = await explainAnalyze('setting-local', query, undefined, {
      localSettings: { random_page_cost: '1000000' },
    })
    const after = await explainAnalyze('setting-after', query)

    expect(rootPlan(before)['Actual Rows']).toBe(0)
    expect(rootPlan(local)['Actual Rows']).toBe(1)
    expect(rootPlan(after)['Actual Rows']).toBe(0)
  })

  it('rolls back an explained write to one owned user', async () => {
    const user = await createTestUserDirect()
    const replacement = createTestUsername()
    try {
      const explained = await explainAnalyze(
        'owned-write-rollback',
        `/* explainOwnedWriteRollback */
          UPDATE users SET username = $2 WHERE id = $1::uuid RETURNING id`,
        [user.id, replacement],
      )

      expect(rootPlan(explained)['Actual Rows']).toBe(1)
      expect((await getTestPrivateUserById(user.id))?.username).toBe(user.username)
    } finally {
      await deleteTestUser(user.id)
    }
  })
})
