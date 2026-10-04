import { write } from '@data-stores/psql'
import { getExternalFetch } from '@modules/utils/http-dispatchers'
import { recordScheduledJobConfigMissing } from '@modules/on-error'
import Sentry from '@modules/on-error/sentry'
import sql from 'sql-template-strings'
import { getCopyrightDsaSorDatabaseFrom, isCopyrightDsaSorDatabaseEnabled } from './config.mts'
import { submitDsaTransparencyDatabaseStatement } from './dsa-transparency-database-client.mts'
import { isDsaTransparencyDatabaseConfigured } from './dsa-statement-submission-config.mts'
import { claimDsaStatementSubmission } from './dsa-statement-submission-claims.mts'
import { recordDsaStatementSubmissionResult } from './dsa-statement-submission-ledger.mts'

export type ProcessDsaStatementSubmissionResult =
  | { status: 'disabled' | 'not_claimable' | 'configuration_missing' | 'dead_lettered' }
  | { status: 'submitted'; recorded: boolean }
  | {
      status: 'retryable_failure' | 'permanent_failure'
      recorded: boolean
      deadLettered: boolean
    }

export type ProcessDsaStatementSubmissionDependencies = {
  isEnabled: typeof isCopyrightDsaSorDatabaseEnabled
  getFrom: typeof getCopyrightDsaSorDatabaseFrom
  requestFetch?: ReturnType<typeof getExternalFetch>
  isConfigured: typeof isDsaTransparencyDatabaseConfigured
  url: () => string | undefined
  token: () => string | undefined
  recordConfigMissing: typeof recordScheduledJobConfigMissing
  recordFailure: (input: { submissionId: string; statusCode: number | null }) => void
}

const defaultDependencies: ProcessDsaStatementSubmissionDependencies = {
  isEnabled: isCopyrightDsaSorDatabaseEnabled,
  getFrom: getCopyrightDsaSorDatabaseFrom,
  isConfigured: isDsaTransparencyDatabaseConfigured,
  url: () => process.env.DSA_TRANSPARENCY_DATABASE_URL,
  token: () => process.env.DSA_TRANSPARENCY_DATABASE_TOKEN,
  recordConfigMissing: recordScheduledJobConfigMissing,
  recordFailure: recordDsaStatementSubmissionFailure,
}

/** Claims one durable item, sends its frozen payload, then commits only while its lease still matches. */
export async function processDsaStatementSubmission(
  submissionId: string,
  overrides: Partial<ProcessDsaStatementSubmissionDependencies> = {},
): Promise<ProcessDsaStatementSubmissionResult> {
  const dependencies = { ...defaultDependencies, ...overrides }
  if (!(await dependencies.isEnabled())) return { status: 'disabled' }
  const from = await dependencies.getFrom()
  if (!from) return { status: 'configuration_missing' }
  const credentials = {
    url: dependencies.url() ?? '',
    token: dependencies.token() ?? '',
  }
  if (!dependencies.isConfigured(credentials)) return { status: 'configuration_missing' }

  const claim = await claimDsaStatementSubmission(submissionId, from)
  if (claim.kind === 'not_claimable') return { status: 'not_claimable' }
  if (claim.kind === 'dead_lettered') return { status: 'dead_lettered' }
  if (claim.kind === 'lease_expired' && claim.deadLettered) {
    dependencies.recordFailure({ submissionId, statusCode: null })
    return { status: 'dead_lettered' }
  }
  if (claim.kind !== 'claimed') return { status: 'not_claimable' }

  if (!(await dependencies.isEnabled())) {
    await releaseDsaStatementSubmissionLease(submissionId, claim.submission.leaseToken)
    return { status: 'disabled' }
  }
  const currentFrom = await dependencies.getFrom()
  if (!currentFrom || !dependencies.isConfigured(credentials)) {
    await releaseDsaStatementSubmissionLease(submissionId, claim.submission.leaseToken)
    return { status: 'configuration_missing' }
  }
  if (claim.submission.imposedAt < currentFrom) {
    await releaseDsaStatementSubmissionLease(submissionId, claim.submission.leaseToken)
    return { status: 'not_claimable' }
  }
  const currentCredentials = {
    url: dependencies.url() ?? '',
    token: dependencies.token() ?? '',
  }
  if (!dependencies.isConfigured(currentCredentials)) {
    await releaseDsaStatementSubmissionLease(submissionId, claim.submission.leaseToken)
    return { status: 'configuration_missing' }
  }
  const result = await submitDsaTransparencyDatabaseStatement(
    claim.submission.payload,
    currentCredentials,
    dependencies.requestFetch,
  )
  if (result.kind === 'configuration_missing') {
    await releaseDsaStatementSubmissionLease(submissionId, claim.submission.leaseToken)
    return { status: 'configuration_missing' }
  }

  const recorded = await recordDsaStatementSubmissionResult({
    submissionId,
    leaseToken: claim.submission.leaseToken,
    outcome: result.kind,
    statusCode: result.statusCode,
    errorCode: result.kind === 'submitted' ? null : result.errorCode,
    responseUuid: result.kind === 'submitted' ? result.uuid : undefined,
  })
  if (recorded.deadLettered)
    dependencies.recordFailure({ submissionId, statusCode: result.statusCode })
  if (result.kind === 'submitted') return { status: 'submitted', recorded: recorded.recorded }
  return {
    status: result.kind,
    recorded: recorded.recorded,
    deadLettered: recorded.deadLettered,
  }
}

async function releaseDsaStatementSubmissionLease(
  submissionId: string,
  leaseToken: string,
): Promise<void> {
  await write(sql`/* releaseDsaStatementSubmissionLease */
    UPDATE copyright_dsa_statement_submissions
    SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE id = ${submissionId} AND lease_token = ${leaseToken}
  `)
}

function recordDsaStatementSubmissionFailure(input: {
  submissionId: string
  statusCode: number | null
}): void {
  Sentry.captureMessage('copyright_dsa_statement_submission_dead_lettered', {
    level: 'warning',
    tags: { reason: 'copyright_dsa_statement_submission_dead_lettered' },
    extra: { submissionId: input.submissionId, statusCode: input.statusCode },
  })
}
