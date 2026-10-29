import { read, write } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import sql from 'sql-template-strings'
import {
  copyrightConfig,
  getCopyrightRetentionWindows,
} from '../services/copyright-notices/config.mts'

export type CopyrightDsaRetentionClock = {
  dsa_activity_at: Date | null
  projected_clock: Date
}

/** Read the persisted DSA activity projection and the canonical shared case clock. */
export async function readCopyrightDsaRetentionClock(
  noticeId: string,
): Promise<CopyrightDsaRetentionClock> {
  await copyrightConfig.waitForInitialization()
  const { rows } = await read<CopyrightDsaRetentionClock>(sql`
    /* readCopyrightDsaRetentionClock */
    SELECT identity.dsa_activity_at,
      GREATEST(fn_project_copyright_minimal_record_legal_clock(
        notice.id, ${getCopyrightRetentionWindows().complaintMonths}
      ), work.legal_clock_at, work.party_legal_clock_at) AS projected_clock
    FROM copyright_notices notice
    JOIN copyright_notice_retained_identities identity ON identity.id = notice.id
    LEFT JOIN copyright_notice_minimal_purge_continuations work
      ON work.copyright_notice_identity_id = notice.id
    WHERE notice.id = ${noticeId}
  `)
  if (!rows[0]) throw new Error('Copyright DSA retention clock fixture missing')
  return rows[0]
}

/** Read the terminal payload-build failure row written by its real producer. */
export async function readCopyrightDsaBuildFailure(restrictionId: string): Promise<{
  id: string
  failed_at: Date
}> {
  const { rows } = await read<{ id: string; failed_at: Date | null }>(sql`
    /* readCopyrightDsaBuildFailureAt */
    SELECT id, failed_at FROM copyright_dsa_statement_submissions
    WHERE copyright_restriction_id = ${restrictionId}
  `)
  const failure = rows[0]
  if (!failure?.failed_at) throw new Error('Copyright DSA build failure fixture missing')
  return { id: failure.id, failed_at: failure.failed_at }
}

export async function readCopyrightDsaSubmissionMaintenance(submissionId: string): Promise<{
  available_at: Date
  lease_token: string | null
  updated_at: Date
}> {
  const { rows } = await read<{
    available_at: Date
    lease_token: string | null
    updated_at: Date
  }>(sql`
    /* readCopyrightDsaSubmissionMaintenance */
    SELECT available_at, lease_token::text, updated_at
    FROM copyright_dsa_statement_submissions WHERE id = ${submissionId}
  `)
  if (!rows[0]) throw new Error('Copyright DSA submission maintenance fixture missing')
  return rows[0]
}

/** Seed an immutable external-outcome ledger row at an exact UUIDv7 timestamp. */
export async function seedCopyrightDsaPermanentFailureAttemptAt(
  submissionId: string,
  occurredAt: Date,
): Promise<string> {
  const id = uuidv7({ msecs: occurredAt.getTime() })
  await write(sql`
    /* seedCopyrightDsaPermanentFailureAttemptAt */
    INSERT INTO copyright_dsa_statement_submission_attempts (
      id, copyright_dsa_statement_submission_id, attempt_number, outcome, status_code, error_code
    ) VALUES (
      ${id}, ${submissionId}, 1, 'permanent_failure', 503, 'http_503'
    )
  `)
  return id
}
