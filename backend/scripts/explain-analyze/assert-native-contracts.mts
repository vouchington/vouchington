import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { read, write } from '@data-stores/psql'
import { explainAnalyze } from '@data-stores/psql/explain-analyze'

function collectPlanNodes(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(collectPlanNodes)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  return [record, ...Object.values(record).flatMap(collectPlanNodes)]
}

async function withScratchTable<T>(
  prefix: string,
  setup: (table: string) => Promise<void>,
  check: (table: string) => Promise<T>,
): Promise<T> {
  const table = `${prefix}_${randomUUID().replaceAll('-', '')}`
  const drop = () => write(`/* assertExplainNativeContracts */ DROP TABLE IF EXISTS ${table}`)
  let result: T
  try {
    await setup(table)
    result = await check(table)
  } catch (err) {
    try {
      await drop()
    } catch (cleanupErr) {
      throw new AggregateError([err, cleanupErr], `EXPLAIN scratch cleanup failed for ${table}`, {
        cause: cleanupErr,
      })
    }
    throw err
  }
  await drop()
  return result
}

async function withIndexedSkew<T>(
  prefix: string,
  check: (table: string) => Promise<T>,
): Promise<T> {
  return withScratchTable(
    prefix,
    async table => {
      await write(`/* assertExplainNativeContracts */
        CREATE TABLE ${table} AS
        SELECT CASE WHEN value = 100000 THEN 2 ELSE 1 END AS lookup_key
        FROM generate_series(1, 100000) value`)
      await write(`/* assertExplainNativeContracts */ CREATE INDEX ON ${table} (lookup_key)`)
      await write(`/* assertExplainNativeContracts */ ANALYZE ${table}`)
    },
    check,
  )
}

async function assertCustomAndGenericPlans(): Promise<void> {
  await withIndexedSkew('explain_plan_cache', async table => {
    const query = `/* assertExplainNativeContracts */ SELECT count(*) FROM ${table} WHERE lookup_key = $1`
    const [custom, generic] = await Promise.all([
      explainAnalyze('custom', query, [2], { planCacheMode: 'force_custom_plan' }),
      explainAnalyze('generic', query, [2], { planCacheMode: 'force_generic_plan' }),
    ])
    const customScan = collectPlanNodes(custom.plan).find(node => node['Relation Name'] === table)
    const genericScan = collectPlanNodes(generic.plan).find(node => node['Relation Name'] === table)
    const customPlanRows = Number(customScan?.['Plan Rows'])
    const genericPlanRows = Number(genericScan?.['Plan Rows'])

    assert.equal(customScan?.['Node Type'], 'Index Only Scan', 'custom target scan')
    assert.ok(customPlanRows <= 10, `custom plan rows: ${customPlanRows}`)
    assert.ok(genericPlanRows > 10_000, `generic plan rows: ${genericPlanRows}`)
    assert.ok(
      genericPlanRows > customPlanRows * 1_000,
      `generic/custom plan rows: ${genericPlanRows}/${customPlanRows}`,
    )
  })
  console.log('EXPLAIN native contract: custom and generic target plans passed')
}

async function assertLocalPlannerSettings(): Promise<void> {
  await withIndexedSkew('explain_random_page_cost', async table => {
    const query = `/* assertExplainNativeContracts */ SELECT count(*) FROM ${table} WHERE lookup_key = $1`
    const planCacheMode = 'force_custom_plan'
    const scanType = (plan: unknown) =>
      collectPlanNodes(plan).find(node => node['Relation Name'] === table)?.['Node Type']

    const stock = await explainAnalyze('stock', query, [2], { planCacheMode })
    const priced = await explainAnalyze('priced', query, [2], {
      planCacheMode,
      localSettings: { random_page_cost: '1000000' },
    })
    const after = await explainAnalyze('after', query, [2], { planCacheMode })

    assert.equal(scanType(stock.plan), 'Index Only Scan', 'stock target scan')
    assert.equal(scanType(priced.plan), 'Seq Scan', 'locally priced target scan')
    assert.equal(scanType(after.plan), 'Index Only Scan', 'later stock target scan')
  })
  console.log('EXPLAIN native contract: planner setting isolation passed')
}

async function assertRollbackAfterExplain(): Promise<void> {
  await withScratchTable(
    'test_explain_analyze_rollback',
    async table => {
      await write(
        `/* assertExplainNativeContracts */ CREATE TABLE "${table}" (value int PRIMARY KEY)`,
      )
    },
    async table => {
      const result = await explainAnalyze(
        'explainAnalyzeRollbackTest',
        `/* assertExplainNativeContracts */ INSERT INTO "${table}" (value) VALUES ($1)`,
        [1],
      )
      assert.equal(result.name, 'explainAnalyzeRollbackTest')
      assert.ok(result.execution_time_ms >= 0, 'nonnegative execution time')

      const { rows } = await read<{ count: number }>(
        `/* assertExplainNativeContracts */ SELECT COUNT(*)::int AS count FROM "${table}"`,
      )
      assert.deepEqual(rows, [{ count: 0 }], 'explained INSERT must roll back')
    },
  )
  console.log('EXPLAIN native contract: captured INSERT rollback passed')
}

async function main(): Promise<void> {
  let failure: unknown
  let failed = false
  try {
    await assertCustomAndGenericPlans()
    await assertLocalPlannerSettings()
    await assertRollbackAfterExplain()
  } catch (err) {
    failure = err
    failed = true
  }
  try {
    await shutdownDataStoresForOneOffCommand()
  } catch (err) {
    if (failed)
      throw new AggregateError([failure, err], 'EXPLAIN native contracts and shutdown failed', {
        cause: err,
      })
    throw err instanceof Error ? err : new Error('EXPLAIN shutdown failed', { cause: err })
  }
  if (failed)
    throw failure instanceof Error
      ? failure
      : new Error('EXPLAIN native contract failed', { cause: failure })
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
