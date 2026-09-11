import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { QueryOptions } from '@data-stores/psql/types'

/**
 * Unconditionally marks a case as resolved.
 */
export async function resolveCase(
  caseId: string,
  resolvedById: string | null,
  options?: QueryOptions,
): Promise<void> {
  const query = sql`/* resolveCase */
    UPDATE moderation_cases
    SET resolved_at = CURRENT_TIMESTAMP,
        resolved_by_id = ${resolvedById}
    WHERE id = ${caseId} AND resolved_at IS NULL
  `
  await write(query, options)
}

/**
 * Resolves a case only if there are no remaining pending reports or pending appeals
 * linked to this case. The check and update are done atomically on the primary to
 * avoid read-replica staleness races.
 */
export async function maybeResolveCase(
  caseId: string,
  resolvedById: string | null,
  options?: QueryOptions,
): Promise<void> {
  await maybeResolveCases([caseId], resolvedById, options)
}

export async function maybeResolveCases(
  caseIds: string[],
  resolvedById: string | null,
  options?: QueryOptions,
): Promise<void> {
  if (caseIds.length === 0) return
  await write(
    sql`/* maybeResolveCases */
      UPDATE moderation_cases AS moderation_case
      SET resolved_at = CURRENT_TIMESTAMP,
          resolved_by_id = ${resolvedById}
      WHERE moderation_case.id = ANY(${caseIds}::uuid[])
        AND moderation_case.resolved_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM moderation_reports
          WHERE case_id = moderation_case.id AND reviewed_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM moderation_appeals
          WHERE case_id = moderation_case.id AND resolved_at IS NULL
        )
    `,
    options,
  )
}

/**
 * Re-opens a previously resolved case so new child activity (e.g. an appeal filed after
 * case resolution) is grouped back into it.
 */
export async function reopenCase(caseId: string): Promise<void> {
  await write(sql`/* reopenCase */
    UPDATE moderation_cases
    SET resolved_at = NULL, resolved_by_id = NULL
    WHERE id = ${caseId}
  `)
}
