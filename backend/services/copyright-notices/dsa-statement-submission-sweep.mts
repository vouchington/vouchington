import { beginTransaction, read } from '@data-stores/psql'
import { recordScheduledJobConfigMissing } from '@modules/on-error'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'
import { buildCopyrightDsaStatementPayload } from './dsa-statement-payload.mts'
import {
  getDsaStatementBuildFailureCode,
  recordDsaStatementBuildFailure,
  reportDsaStatementBuildFailure,
} from './dsa-statement-submission-build-failure.mts'
import { isDsaTransparencyDatabaseConfigured } from './dsa-statement-submission-config.mts'
import { isCopyrightDsaSorDatabaseEnabled, getCopyrightDsaSorDatabaseFrom } from './config.mts'
import sql from 'sql-template-strings'

const RECONCILE_JOB_NAME = 'processReconcileDsaStatementSubmissions'
const DATABASE_CREDENTIAL_NAMES =
  'DSA_TRANSPARENCY_DATABASE_URL and DSA_TRANSPARENCY_DATABASE_TOKEN'

export type DsaStatementSweepDependencies = {
  isEnabled: typeof isCopyrightDsaSorDatabaseEnabled
  getFrom: typeof getCopyrightDsaSorDatabaseFrom
  recordConfigMissing: typeof recordScheduledJobConfigMissing
  buildPayload: typeof buildCopyrightDsaStatementPayload
  reportBuildFailure: typeof reportDsaStatementBuildFailure
  url: () => string | undefined
  token: () => string | undefined
  isConfigured: typeof isDsaTransparencyDatabaseConfigured
}

const defaultDependencies: DsaStatementSweepDependencies = {
  isEnabled: isCopyrightDsaSorDatabaseEnabled,
  getFrom: getCopyrightDsaSorDatabaseFrom,
  recordConfigMissing: recordScheduledJobConfigMissing,
  buildPayload: buildCopyrightDsaStatementPayload,
  reportBuildFailure: reportDsaStatementBuildFailure,
  url: () => process.env.DSA_TRANSPARENCY_DATABASE_URL,
  token: () => process.env.DSA_TRANSPARENCY_DATABASE_TOKEN,
  isConfigured: isDsaTransparencyDatabaseConfigured,
}

/** Checks both audited gates, materializes eligible decisions once, and never enqueues without credentials. */
export async function prepareDsaStatementSubmissionSweep(
  overrides: Partial<DsaStatementSweepDependencies> & { restrictionIds?: readonly string[] } = {},
): Promise<Date | null> {
  const { restrictionIds, ...dependencyOverrides } = overrides
  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  if (!(await dependencies.isEnabled())) return null
  const from = await dependencies.getFrom()
  if (!from) {
    dependencies.recordConfigMissing(RECONCILE_JOB_NAME, 'copyright.dsaSorDatabaseFrom')
    return null
  }

  await materializeDsaStatementSubmissions(from, {
    buildPayload: dependencies.buildPayload,
    reportBuildFailure: dependencies.reportBuildFailure,
    restrictionIds,
  })
  if (
    !dependencies.isConfigured({ url: dependencies.url() ?? '', token: dependencies.token() ?? '' })
  ) {
    dependencies.recordConfigMissing(RECONCILE_JOB_NAME, DATABASE_CREDENTIAL_NAMES)
    return null
  }
  return from
}

/**
 * Pages immutable restriction ids so work is recorded even if the restriction is lifted later.
 * A restriction whose payload cannot be built becomes a terminal failed row, so it leaves the
 * work predicate and cannot stall the restrictions after it. Returns the payload rows inserted.
 */
export async function materializeDsaStatementSubmissions(
  from: Date,
  overrides: Partial<Pick<DsaStatementSweepDependencies, 'buildPayload' | 'reportBuildFailure'>> & {
    restrictionIds?: readonly string[]
  } = {},
): Promise<number> {
  const { restrictionIds, ...dependencyOverrides } = overrides
  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  // One bounded page per scheduled run. Inserted rows disappear from the next run's
  // NOT EXISTS work predicate, so the table itself is the durable resume marker.
  const page = await queryCopyrightSweepIdPage(
    { limit: 100, ids: restrictionIds },
    'Invalid DSA submission restriction cursor',
    'searchUnmaterializedDsaStatementRestrictionIds',
    'rowId',
    sql`/* materializeDsaStatementSubmissions:page */
      SELECT id FROM (
        SELECT restriction.id AS id
        FROM copyright_restrictions restriction
        WHERE restriction.imposed_at >= ${from}
          AND NOT EXISTS (
            SELECT 1 FROM copyright_dsa_statement_submissions submission
            WHERE submission.copyright_restriction_id = restriction.id
          )
      ) candidates WHERE TRUE`,
    statement => read(statement),
  )
  let inserted = 0
  for (const restrictionId of page.results) {
    // oxlint-disable-next-line no-await-in-loop -- each payload and insert is one transaction.
    if (await materializeDsaStatementSubmission(restrictionId, from, dependencies)) inserted += 1
  }
  return inserted
}

/** Returns true when a payload row was inserted. Only a builder HttpError is recorded and skipped. */
async function materializeDsaStatementSubmission(
  restrictionId: string,
  from: Date,
  dependencies: Pick<DsaStatementSweepDependencies, 'buildPayload' | 'reportBuildFailure'>,
): Promise<boolean> {
  try {
    return await insertDsaStatementSubmission(restrictionId, from, dependencies.buildPayload)
  } catch (err) {
    const failureCode = getDsaStatementBuildFailureCode(err)
    if (!failureCode) throw err
    if (await recordDsaStatementBuildFailure(restrictionId, from, failureCode))
      dependencies.reportBuildFailure({ restrictionId, failureCode })
    return false
  }
}

async function insertDsaStatementSubmission(
  restrictionId: string,
  from: Date,
  buildPayload: typeof buildCopyrightDsaStatementPayload,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const payload = await buildPayload(restrictionId, transaction)
  const { rows } = await transaction<{ id: string }>(sql`/* insertDsaStatementSubmission */
    INSERT INTO copyright_dsa_statement_submissions (copyright_restriction_id, payload, available_at)
    SELECT restriction.id, ${JSON.stringify(payload)}::jsonb, CURRENT_TIMESTAMP
    FROM copyright_restrictions restriction
    WHERE restriction.id = ${restrictionId} AND restriction.imposed_at >= ${from}
    ON CONFLICT (copyright_restriction_id) DO NOTHING
    RETURNING id
  `)
  await transaction.commit()
  return rows.length === 1
}

/** Searches due rows only; the outer keyset gives queryCopyrightSweepIdPage an unambiguous id. */
export function searchRecoverableDsaStatementSubmissionIds(
  options: CopyrightSweepPageOptions & { from: Date },
): Promise<CopyrightSweepIdPage> {
  return queryCopyrightSweepIdPage(
    options,
    'Invalid DSA submission cursor',
    'searchRecoverableDsaStatementSubmissionIds',
    'rowId',
    sql`/* searchRecoverableDsaStatementSubmissionIds */
      SELECT id FROM (
        SELECT submission.id AS id
        FROM copyright_dsa_statement_submissions submission
        JOIN copyright_restrictions restriction
          ON restriction.id = submission.copyright_restriction_id
        WHERE submission.submitted_at IS NULL
          AND submission.failed_at IS NULL
          AND submission.available_at <= CURRENT_TIMESTAMP
          AND (submission.lease_token IS NULL OR submission.lease_expires_at <= CURRENT_TIMESTAMP)
          AND restriction.imposed_at >= ${options.from}
          AND NOT EXISTS (
            SELECT 1 FROM copyright_dsa_statement_submission_attempts attempt
            WHERE attempt.copyright_dsa_statement_submission_id = submission.id
              AND attempt.outcome = 'permanent_failure'
              AND NOT EXISTS (
                SELECT 1 FROM copyright_dsa_statement_submission_attempts replay
                WHERE replay.copyright_dsa_statement_submission_id = attempt.copyright_dsa_statement_submission_id
                  AND replay.outcome = 'replayed' AND replay.attempt_number > attempt.attempt_number
              )
          )
          AND (
            SELECT COUNT(*)::integer
            FROM copyright_dsa_statement_submission_attempts attempt
            WHERE attempt.copyright_dsa_statement_submission_id = submission.id
              AND attempt.outcome = 'retryable_failure'
              AND NOT EXISTS (
                SELECT 1 FROM copyright_dsa_statement_submission_attempts replay
                WHERE replay.copyright_dsa_statement_submission_id = attempt.copyright_dsa_statement_submission_id
                  AND replay.outcome = 'replayed' AND replay.attempt_number > attempt.attempt_number
              )
          ) < 5
      ) due WHERE TRUE`,
    statement => read(statement),
  )
}
