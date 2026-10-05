import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestMediaDeliveryCoverageGap = {
  delivery_key: string
  placement_id: string
  state: 'missing' | 'pending' | 'claimed' | 'failed'
  failure_message: string | null
}

/**
 * Runs the operator coverage query from the edge-enforcement runbook verbatim as a subquery, then
 * narrows the result to owned placements. Only the narrowing is test-specific: the shared test
 * database is parallel, so the whole-registry result also holds rows from unrelated tests.
 */
export async function listTestMediaDeliveryCoverageGaps(
  coverageQuery: string,
  placementIds: readonly string[],
): Promise<TestMediaDeliveryCoverageGap[]> {
  const statement = sql`/* listTestMediaDeliveryCoverageGaps */ SELECT gap.* FROM (`
  statement.append(coverageQuery)
  statement.append(sql`
  ) gap WHERE gap.placement_id = ANY(${[...placementIds]}::uuid[])
  ORDER BY gap.delivery_key`)
  const { rows } = await read<TestMediaDeliveryCoverageGap>(statement)
  return rows
}
