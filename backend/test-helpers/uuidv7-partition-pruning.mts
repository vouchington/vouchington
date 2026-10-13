import { randomUUID } from 'node:crypto'
import {
  beginTransaction,
  writePool,
  type PoolClient,
  type TransactionQuery,
} from '@data-stores/psql'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { parseMonthlyPartitionName } from '../data-stores/psql/config-driven/utils/partition-utils.mts'

type Mode = 'force_custom_plan' | 'force_generic_plan'
type Partition = { name: string; bound: string; oid: string }
type Plan = { 'QUERY PLAN': unknown }
type Fixture = { names: string[]; ids: string[]; lower: string; upper: string }

export async function withCanonicalUuidv7Pruning(
  mode: Mode,
  check: (evidence: {
    pointPlan: unknown
    rangePlan: unknown
    pointRelations: string[]
    rangeRelations: string[]
    pointIds: string[]
    rangeIds: string[]
    expectedPoint: string[]
    expectedRange: string[]
  }) => void,
): Promise<void> {
  const client = await writePool.connect()
  const statements = [
    `uuidv7_point_${randomUUID().replaceAll('-', '')}`,
    `uuidv7_range_${randomUUID().replaceAll('-', '')}`,
  ]
  const errors: unknown[] = []
  let transaction: Awaited<ReturnType<typeof beginTransaction>> | undefined
  let destroy = false
  const record = (error: unknown) => {
    if (!errors.some(value => Object.is(value, error))) errors.push(error)
  }
  try {
    transaction = await beginTransaction({ client })
    const fixture = await createFixture(transaction)
    await transaction(
      "/* canonicalUuidv7PruningMode */ SELECT set_config('plan_cache_mode', $1, true)",
      [mode],
    )
    const settings = await transaction<{ mode: string; pruning: string }>(
      "/* canonicalUuidv7PruningSettings */ SELECT current_setting('plan_cache_mode') AS mode, current_setting('enable_partition_pruning') AS pruning",
    )
    if (settings.rows[0]?.mode !== mode || settings.rows[0]?.pruning !== 'on')
      throw new Error('Canonical pruning settings mismatch')
    // Names are owned hexadecimal UUID suffixes, never external SQL identifiers.
    await transaction(
      `/* prepareCanonicalUuidv7Point */ PREPARE ${statements[0]}(uuid) AS SELECT id FROM public.crawls WHERE id = $1`,
    )
    await transaction(
      `/* prepareCanonicalUuidv7Range */ PREPARE ${statements[1]}(uuid, uuid) AS SELECT id FROM public.crawls WHERE id >= $1 AND id < $2`,
    )
    const point = await transaction<Plan>(
      `/* explainCanonicalUuidv7Point */ EXPLAIN (FORMAT JSON, COSTS OFF) EXECUTE ${statements[0]}('${fixture.ids[1]}')`,
    )
    const range = await transaction<Plan>(
      `/* explainCanonicalUuidv7Range */ EXPLAIN (FORMAT JSON, COSTS OFF) EXECUTE ${statements[1]}('${fixture.lower}', '${fixture.upper}')`,
    )
    const pointRows = await transaction<{ id: string }>(
      '/* readCanonicalUuidv7Point */ SELECT id FROM public.crawls WHERE id = $1 AND id = ANY($2::uuid[])',
      [fixture.ids[1], fixture.ids],
    )
    const rangeRows = await transaction<{ id: string }>(
      '/* readCanonicalUuidv7Range */ SELECT id FROM public.crawls WHERE id >= $1 AND id < $2 AND id = ANY($3::uuid[]) ORDER BY id',
      [fixture.lower, fixture.upper, fixture.ids],
    )
    check({
      pointPlan: point.rows[0]?.['QUERY PLAN'],
      rangePlan: range.rows[0]?.['QUERY PLAN'],
      pointRelations: [fixture.names[1]!],
      rangeRelations: fixture.names.slice(1),
      pointIds: pointRows.rows.map(row => row.id),
      rangeIds: rangeRows.rows.map(row => row.id),
      expectedPoint: [fixture.ids[1]!],
      expectedRange: fixture.ids.slice(1, 3).toSorted(),
    })
  } catch (err) {
    record(err)
  }
  // An aborted transaction cannot DEALLOCATE. Borrowed rollback retains this exact client.
  try {
    if (transaction) await transaction.rollback()
    else destroy = true
  } catch (err) {
    record(err)
    destroy = true
  }
  try {
    if (transaction) await removeOwnedStatements(client, statements)
  } catch (err) {
    record(err)
    destroy = true
  }
  try {
    client.release(destroy)
  } catch (err) {
    record(err)
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, 'Canonical UUIDv7 pruning and cleanup failed', {
      cause: errors[0],
    })
}

async function removeOwnedStatements(client: PoolClient, names: string[]): Promise<void> {
  // Also catches PREPARE admitted before a transport failure; never DEALLOCATE ALL.
  const result = await client.query<{ name: string }>(
    '/* readOwnedUuidv7Statements */ SELECT name FROM pg_prepared_statements WHERE name = ANY($1::text[])',
    [names],
  )
  const errors: unknown[] = []
  for (const row of result.rows) {
    try {
      await client.query(`/* deallocateOwnedUuidv7Statement */ DEALLOCATE ${row.name}`)
    } catch (err) {
      if (!errors.some(value => Object.is(value, err))) errors.push(err)
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, 'Owned prepared statement cleanup failed', {
      cause: errors[0],
    })
}

async function createFixture(query: TransactionQuery): Promise<Fixture> {
  const result = await query<Partition>(`/* readCanonicalCrawlPartitions */
    SELECT child.oid::text AS oid, child.relname AS name, pg_get_expr(child.relpartbound, child.oid) AS bound
    FROM pg_inherits inheritance JOIN pg_class child ON child.oid = inheritance.inhrelid
    WHERE inheritance.inhparent = 'public.crawls'::regclass ORDER BY child.relname`)
  const candidates = result.rows
    .map(row => {
      const month = parseMonthlyPartitionName(row.name)
      if (!month || month.table !== 'crawls') throw new Error('Noncanonical crawl partition')
      const start = Date.UTC(month.year, month.month - 1, 1)
      const end = Date.UTC(month.year, month.month, 1)
      const expected = `FOR VALUES FROM ('${timestampToUuidv7LowerBound(start)}') TO ('${timestampToUuidv7LowerBound(end)}')`
      if (row.bound !== expected) throw new Error('Canonical crawl partition bounds mismatch')
      return { ...row, start, end }
    })
    .slice(-3)
  if (
    candidates.length !== 3 ||
    candidates[0]!.end !== candidates[1]!.start ||
    candidates[1]!.end !== candidates[2]!.start
  )
    throw new Error('Three adjacent canonical crawl partitions required')
  const schema = await query<{ key: string; indexed: boolean }>(`/* readCanonicalCrawlKey */
    SELECT pg_get_partkeydef('public.crawls'::regclass) AS key,
      EXISTS (SELECT 1 FROM pg_index WHERE indrelid = 'public.crawls'::regclass AND indisprimary AND indisvalid) AS indexed`)
  if (schema.rows[0]?.key !== 'RANGE (id)' || !schema.rows[0]?.indexed)
    throw new Error('Canonical crawl key/index mismatch')
  const hostname = `pruning-${randomUUID()}.example.com`
  const host = await query<{ id: string }>(
    '/* insertCanonicalPruningHostname */ INSERT INTO url_hostnames (hostname) VALUES ($1) RETURNING id',
    [hostname],
  )
  const url = await query<{ id: string }>(
    '/* insertCanonicalPruningUrl */ INSERT INTO urls (url, hostname_id, search_params) VALUES ($1, $2, $3::jsonb) RETURNING id',
    [`https://${hostname}/`, host.rows[0]!.id, '{}'],
  )
  const upperTime = candidates[2]!.start + 2
  const times = [
    candidates[0]!.start + 1,
    candidates[1]!.start + 1,
    candidates[2]!.start + 1,
    upperTime,
  ]
  const ids = times.map(time => {
    const bound = timestampToUuidv7LowerBound(time)
    const random = randomUUID()
    return `${bound.slice(0, 14)}7${random.slice(15, 18)}-8${random.slice(20)}`
  })
  const inserted = await query<{ id: string; partition: string }>(
    `/* insertCanonicalPruningCrawls */
    INSERT INTO crawls (id, url_id, response_status_code, markdown)
    SELECT id, $2::uuid, 200, '' FROM unnest($1::uuid[]) AS owned(id)
    RETURNING id, tableoid::text AS partition`,
    [ids, url.rows[0]!.id],
  )
  const expected = [candidates[0]!.oid, candidates[1]!.oid, candidates[2]!.oid, candidates[2]!.oid]
  const partitionsById = new Map(inserted.rows.map(row => [row.id, row.partition]))
  for (const [index, id] of ids.entries()) {
    if (partitionsById.get(id) !== expected[index])
      throw new Error('Canonical owned row routing mismatch')
  }
  return {
    names: candidates.map(row => row.name),
    ids,
    lower: timestampToUuidv7LowerBound(candidates[1]!.start),
    upper: timestampToUuidv7LowerBound(upperTime),
  }
}
