import { assertSafeSqlIdentifier } from '@vouchington/postgres/partitions'
import type { QueryExecutor } from '../types.mts'

const REPORT_SOURCE_TABLES = new Set([
  'copyright_territorial_decisions',
  'copyright_territorial_redress_decisions',
])

export function isCopyrightReportSource(table: string): boolean {
  return REPORT_SOURCE_TABLES.has(table)
}

/**
 * Each scalar value is one indexed seek on the validated physical child. Both business instants
 * must lie in the same report period; the report must also include every source generation.
 */
export function copyrightHistoryReportProbeSql(partitionName: string): string {
  const partition = assertSafeSqlIdentifier(partitionName)
  return `SELECT source.first_at, source.last_at, source.max_generation,
    source.first_at IS NULL OR EXISTS (
      SELECT 1 FROM copyright_eu_transparency_reports AS report
      WHERE report.jurisdiction = 'eu_dsa'
        AND tstzrange(report.period_started_at, report.period_ended_at, '[)') @> source.first_at
        AND tstzrange(report.period_started_at, report.period_ended_at, '[)') @> source.last_at
        AND int8range(NULL, report.source_generation, '[]') @> source.max_generation::bigint
      LIMIT 1
    ) AS covered
    FROM (
      SELECT
        (SELECT decided_at FROM ${partition} WHERE jurisdiction = 'eu_dsa'
          ORDER BY decided_at ASC LIMIT 1) AS first_at,
        (SELECT decided_at FROM ${partition} WHERE jurisdiction = 'eu_dsa'
          ORDER BY decided_at DESC LIMIT 1) AS last_at,
        (SELECT transparency_generation FROM ${partition} WHERE jurisdiction = 'eu_dsa'
          ORDER BY transparency_generation DESC LIMIT 1) AS max_generation
    ) AS source`
}

/** Reuse the same SQL predicate in preview and the locked direct guard. */
export async function copyrightHistoryReportIsCovered(
  query: QueryExecutor,
  partitionName: string,
): Promise<boolean> {
  const { rows } = await query<{ covered: boolean }>(
    `/* copyrightHistoryReportIsCovered */ ${copyrightHistoryReportProbeSql(partitionName)}`,
  )
  return rows[0]?.covered ?? false
}

/**
 * The caller has already locked and proved this child. Keep PostgreSQL's microsecond timestamps
 * inside the transaction; converting either boundary to a JavaScript Date would round it.
 */
export async function recordCopyrightHistoryReportSourceRetirement(
  query: QueryExecutor,
  partitionName: string,
): Promise<void> {
  await query(`/* recordCopyrightHistoryReportSourceRetirement */
    INSERT INTO copyright_transparency_erased_source_ranges (is_singleton, earliest_at, latest_at, retired_source_generation)
    SELECT true, proof.first_at, proof.last_at, proof.max_generation
    FROM (${copyrightHistoryReportProbeSql(partitionName)}) AS proof
    WHERE proof.first_at IS NOT NULL AND proof.covered
    ON CONFLICT (is_singleton) DO UPDATE SET
      earliest_at = LEAST(copyright_transparency_erased_source_ranges.earliest_at,
        EXCLUDED.earliest_at),
      latest_at = GREATEST(copyright_transparency_erased_source_ranges.latest_at,
        EXCLUDED.latest_at),
      retired_source_generation = GREATEST(copyright_transparency_erased_source_ranges.retired_source_generation,
        EXCLUDED.retired_source_generation)`)
}
