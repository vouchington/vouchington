import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { beginTransaction, onGracefulShutdown } from '../index.mts'

type ExplainRow = { 'QUERY PLAN': unknown }

function collectRelationNames(value: unknown, names = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectRelationNames(item, names)
    return names
  }
  if (value === null || typeof value !== 'object') return names
  for (const [key, child] of Object.entries(value)) {
    if (key === 'Relation Name' && typeof child === 'string') names.add(child)
    collectRelationNames(child, names)
  }
  return names
}

describe('UUIDv7 range partition pruning', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'prunes point and bounded-range queries with %s',
    async planCacheMode => {
      const suffix = randomUUID().replaceAll('-', '')
      const table = `uuidv7_pruning_${suffix}`
      const pointStatement = `uuidv7_point_${suffix}`
      const rangeStatement = `uuidv7_range_${suffix}`
      const boundary1 = '01900000-0000-7000-8000-000000000000'
      const boundary2 = '01a00000-0000-7000-8000-000000000000'

      await using transaction = await beginTransaction()
      const query = transaction
      await query(`/* createUuidv7PruningFixture */
          CREATE TEMP TABLE ${table} (user_id uuid NOT NULL) PARTITION BY RANGE (user_id)`)
      await query(`/* createUuidv7PruningEarlyPartition */
          CREATE TEMP TABLE ${table}_early PARTITION OF ${table}
            FOR VALUES FROM (MINVALUE) TO ('${boundary1}')`)
      await query(`/* createUuidv7PruningMiddlePartition */
          CREATE TEMP TABLE ${table}_middle PARTITION OF ${table}
            FOR VALUES FROM ('${boundary1}') TO ('${boundary2}')`)
      await query(`/* createUuidv7PruningLatePartition */
          CREATE TEMP TABLE ${table}_late PARTITION OF ${table}
            FOR VALUES FROM ('${boundary2}') TO (MAXVALUE)`)
      await query(`/* setUuidv7PruningPlanMode */ SET LOCAL plan_cache_mode = ${planCacheMode}`)
      await query(`/* prepareUuidv7PointPruning */
          PREPARE ${pointStatement}(uuid) AS
          SELECT user_id FROM ${table} WHERE user_id = $1`)
      await query(`/* prepareUuidv7RangePruning */
          PREPARE ${rangeStatement}(uuid, uuid) AS
          SELECT user_id FROM ${table} WHERE user_id >= $1 AND user_id < $2`)

      const point = await query<ExplainRow>(`/* explainUuidv7PointPruning */
          EXPLAIN (FORMAT JSON, COSTS OFF)
          EXECUTE ${pointStatement}('01980000-0000-7000-8000-000000000000')`)
      const range = await query<ExplainRow>(`/* explainUuidv7RangePruning */
          EXPLAIN (FORMAT JSON, COSTS OFF)
          EXECUTE ${rangeStatement}(
            '${boundary1}',
            '01a80000-0000-7000-8000-000000000000'
          )`)

      expect([...collectRelationNames(point.rows[0]?.['QUERY PLAN'])].toSorted()).toEqual([
        `${table}_middle`,
      ])
      expect([...collectRelationNames(range.rows[0]?.['QUERY PLAN'])].toSorted()).toEqual([
        `${table}_late`,
        `${table}_middle`,
      ])
      await transaction.commit()
    },
  )
})
