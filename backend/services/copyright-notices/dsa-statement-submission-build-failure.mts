import { write } from '@data-stores/psql'
import Sentry from '@modules/on-error/sentry'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'

export type DsaStatementBuildFailureReport = { restrictionId: string; failureCode: string }

/**
 * Classifies the payload builder's own HttpError asserts as data problems, never retried. Anything
 * else (a database or programming error) returns null so the caller rethrows and the run fails
 * loudly. The code is the fixed `http_<status>` class; an error message is never stored.
 */
export function getDsaStatementBuildFailureCode(error: unknown): string | null {
  return createHttpError.isHttpError(error) ? `http_${error.status}` : null
}

/**
 * Records a payload-less terminal failed row so the unmaterialized-work predicate skips the
 * restriction. Returns false when another sweep already recorded it or the restriction is gone.
 */
export async function recordDsaStatementBuildFailure(
  restrictionId: string,
  from: Date,
  failureCode: string,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* recordDsaStatementBuildFailure */
    INSERT INTO copyright_dsa_statement_submissions (
      copyright_restriction_id, payload, failed_at, failure_code, available_at
    )
    SELECT restriction.id, NULL, CURRENT_TIMESTAMP, ${failureCode}, CURRENT_TIMESTAMP
    FROM copyright_restrictions restriction
    WHERE restriction.id = ${restrictionId} AND restriction.imposed_at >= ${from}
    ON CONFLICT (copyright_restriction_id) DO NOTHING
  `)
  return rowCount === 1
}

/** One warning per recorded failure; ids and the code only, never the payload or any message. */
export function reportDsaStatementBuildFailure(input: DsaStatementBuildFailureReport): void {
  Sentry.captureMessage('copyright_dsa_statement_payload_build_failed', {
    level: 'warning',
    tags: {
      reason: 'copyright_dsa_statement_payload_build_failed',
      restrictionId: input.restrictionId,
      failureCode: input.failureCode,
    },
  })
}
