import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { read, write } from './index.mts'
import {
  buildExplainAnalyzeText,
  buildExplainPreparedStatementText,
  explainAnalyze,
} from './explain-analyze.mts'

describe('buildExplainAnalyzeText', () => {
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

  it('captures distinct target plans under forced custom and generic plan modes', async () => {
    const table = `explain_plan_cache_${randomUUID().replaceAll('-', '')}`
    try {
      await write(`/* explainPlanCacheTest */
        CREATE TABLE ${table} AS
        SELECT CASE WHEN value = 100000 THEN 2 ELSE 1 END AS lookup_key
        FROM generate_series(1, 100000) value`)
      await write(`/* explainPlanCacheTest */ CREATE INDEX ON ${table} (lookup_key)`)
      await write(`/* explainPlanCacheTest */ ANALYZE ${table}`)

      const query = `/* explainPlanCacheTest */ SELECT count(*) FROM ${table} WHERE lookup_key = $1`
      const [custom, generic] = await Promise.all([
        explainAnalyze('custom', query, [2], { planCacheMode: 'force_custom_plan' }),
        explainAnalyze('generic', query, [2], { planCacheMode: 'force_generic_plan' }),
      ])

      const customScan = collectPlanNodes(custom.plan).find(node => node['Relation Name'] === table)
      const genericScan = collectPlanNodes(generic.plan).find(
        node => node['Relation Name'] === table,
      )
      const customPlanRows = Number(customScan?.['Plan Rows'])
      const genericPlanRows = Number(genericScan?.['Plan Rows'])

      expect(customScan?.['Node Type']).toBe('Index Only Scan')
      expect(customPlanRows).toBeLessThanOrEqual(10)
      expect(genericPlanRows).toBeGreaterThan(10_000)
      expect(genericPlanRows).toBeGreaterThan(customPlanRows * 1_000)
    } finally {
      await write(`/* explainPlanCacheTest */ DROP TABLE IF EXISTS ${table}`)
    }
  }, 30_000)

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

  it('rolls back mutating statements after capturing the plan', async () => {
    const tableName = `test_explain_analyze_rollback_${randomUUID().replaceAll('-', '')}`

    await write(
      `/* explainAnalyzeRollbackTestSetup */ CREATE TABLE "${tableName}" (value int PRIMARY KEY)`,
    )

    try {
      const result = await explainAnalyze(
        'explainAnalyzeRollbackTest',
        `/* explainAnalyzeRollbackTest */ INSERT INTO "${tableName}" (value) VALUES ($1)`,
        [1],
      )

      expect(result.name).toBe('explainAnalyzeRollbackTest')
      expect(result.execution_time_ms).toBeGreaterThanOrEqual(0)

      const { rows } = await read<{ count: number }>(
        `/* explainAnalyzeRollbackTestCount */ SELECT COUNT(*)::int AS count FROM "${tableName}"`,
      )
      expect(rows).toEqual([{ count: 0 }])
    } finally {
      await write(`/* explainAnalyzeRollbackTestCleanup */ DROP TABLE IF EXISTS "${tableName}"`)
    }
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
})

function collectPlanNodes(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(collectPlanNodes)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  return [record, ...Object.values(record).flatMap(collectPlanNodes)]
}
