import { write } from '@data-stores/psql'
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

/** Claims one durable item, sends its frozen payload, then commits only while its lease still matches. */
export async function processDsaStatementSubmission(
  submissionId: string,
): Promise<ProcessDsaStatementSubmissionResult> {
  if (!(await isCopyrightDsaSorDatabaseEnabled())) return { status: 'disabled' }
  const from = await getCopyrightDsaSorDatabaseFrom()
  if (!from) return { status: 'configuration_missing' }
  const credentials = readDsaTransparencyDatabaseCredentials()
  if (!isDsaTransparencyDatabaseConfigured(credentials)) return { status: 'configuration_missing' }

  const claim = await claimDsaStatementSubmission(submissionId, from)
  if (claim.kind === 'not_claimable') return { status: 'not_claimable' }
  if (claim.kind === 'dead_lettered') return { status: 'dead_lettered' }
  if (claim.kind === 'lease_expired' && claim.deadLettered) {
    recordDsaStatementSubmissionFailure({ submissionId, statusCode: null })
    return { status: 'dead_lettered' }
  }
  if (claim.kind !== 'claimed') return { status: 'not_claimable' }

  if (!(await isCopyrightDsaSorDatabaseEnabled())) {
    await releaseDsaStatementSubmissionLease(submissionId, claim.submission.leaseToken)
    return { status: 'disabled' }
  }
  const currentFrom = await getCopyrightDsaSorDatabaseFrom()
  if (!currentFrom || !isDsaTransparencyDatabaseConfigured(credentials)) {
    await releaseDsaStatementSubmissionLease(submissionId, claim.submission.leaseToken)
    return { status: 'configuration_missing' }
  }
  if (claim.submission.imposedAt < currentFrom) {
    await releaseDsaStatementSubmissionLease(submissionId, claim.submission.leaseToken)
    return { status: 'not_claimable' }
  }
  const currentCredentials = readDsaTransparencyDatabaseCredentials()
  if (!isDsaTransparencyDatabaseConfigured(currentCredentials)) {
    await releaseDsaStatementSubmissionLease(submissionId, claim.submission.leaseToken)
    return { status: 'configuration_missing' }
  }
  const result = await submitDsaTransparencyDatabaseStatement(
    claim.submission.payload,
    currentCredentials,
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
    recordDsaStatementSubmissionFailure({ submissionId, statusCode: result.statusCode })
  if (result.kind === 'submitted') return { status: 'submitted', recorded: recorded.recorded }
  return {
    status: result.kind,
    recorded: recorded.recorded,
    deadLettered: recorded.deadLettered,
  }
}

function readDsaTransparencyDatabaseCredentials(): { url: string; token: string } {
  return {
    url: process.env.DSA_TRANSPARENCY_DATABASE_URL ?? '',
    token: process.env.DSA_TRANSPARENCY_DATABASE_TOKEN ?? '',
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
