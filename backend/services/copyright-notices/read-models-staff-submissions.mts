import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import { decryptSecret } from '@modules/token-secrets'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { toCopyrightAiRun, type CopyrightAiRun } from './ai-run-types.mts'
import { collectKeysetPages, selectSubmissionTargetIdsBySubmission } from './bounded-reads.mts'
import { groupByNotice } from './read-models-staff-group.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'
import { parseStoredCopyrightSubmissionGuidance } from './read-models-staff-guidance.mts'
import { getCopyrightSweepLimits } from './work-limits.mts'

export { selectStaffRestrictions } from './read-models-staff-restrictions.mts'

export async function selectStaffAppeals(noticeIds: readonly string[], query: TransactionQuery) {
  type AppealRow = {
    copyright_notice_id: string
    submission_id: string
    received_at: Date
    body_ciphertext: string
    recommendation_id: string | null
    recommendation: FiniteValue<'copyright_notice_appeal_recommendation_outcomes'> | null
    rationale_ciphertext: string | null
    run_id: string | null
    run_status: CopyrightAiRun['status'] | null
  }
  const rows = await collectKeysetPages<AppealRow, { receivedAt: Date; id: string }>(
    getCopyrightSweepLimits().batchSize,
    async (cursor, limit) => {
      const { rows: page } = await query<AppealRow>(sql`/* getPendingCopyrightStaffCase:appeals */
        SELECT submission.copyright_notice_id, submission.id AS submission_id,
          submission.received_at, submission.body_ciphertext,
          recommendation.id AS recommendation_id, recommendation.recommendation, recommendation.rationale_ciphertext,
          run.id AS run_id, run.status AS run_status
        FROM copyright_notice_submissions submission
        LEFT JOIN LATERAL (SELECT id, recommendation, rationale_ciphertext FROM copyright_notice_appeal_recommendations WHERE copyright_notice_submission_id = submission.id ORDER BY id DESC LIMIT 1) recommendation ON true
        LEFT JOIN LATERAL (SELECT id, status FROM copyright_notice_appeal_recommendation_runs WHERE copyright_notice_submission_id = submission.id ORDER BY id DESC LIMIT 1) run ON true
        LEFT JOIN copyright_notice_appeal_reviews review ON review.copyright_notice_submission_id = submission.id
        WHERE submission.copyright_notice_id = ANY(${noticeIds}::uuid[]) AND submission.kind = 'appeal' AND review.id IS NULL
          AND (
            ${cursor?.id ?? null}::uuid IS NULL
            OR (submission.received_at, submission.id)
              > (${cursor?.receivedAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
          )
        ORDER BY submission.received_at ASC, submission.id ASC
        LIMIT ${limit}
      `)
      return page
    },
    row => ({ receivedAt: row.received_at, id: row.submission_id }),
  )
  const targetsBySubmission = await selectSubmissionTargetIdsBySubmission(
    query,
    rows.map(row => row.submission_id),
  )
  return groupByNotice(
    rows.map(row => {
      const appeal = parseAppeal(
        decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.submission_id)),
      )
      return {
        copyright_notice_id: row.copyright_notice_id,
        submission_id: row.submission_id,
        reason: appeal.reason,
        target_ids: targetsBySubmission.get(row.submission_id) ?? [],
        recommendation:
          row.recommendation_id && row.recommendation && row.rationale_ciphertext
            ? {
                id: row.recommendation_id,
                recommendation: row.recommendation,
                rationale: decryptSecret(
                  row.rationale_ciphertext,
                  `copyright-appeal:${row.submission_id}`,
                ),
              }
            : null,
        ai_run: toCopyrightAiRun(row.run_id, row.run_status),
      }
    }),
  )
}

export async function selectStaffCounterNotices(
  noticeIds: readonly string[],
  query: TransactionQuery,
) {
  type CounterRow = {
    copyright_notice_id: string
    submission_id: string
    received_at: Date
    body_ciphertext: string
    guidance_ciphertext: string | null
    run_id: string | null
    run_status: CopyrightAiRun['status'] | null
  }
  const rows = await collectKeysetPages<CounterRow, { receivedAt: Date; id: string }>(
    getCopyrightSweepLimits().batchSize,
    async (cursor, limit) => {
      const { rows: page } = await query<CounterRow>(sql`/* getPendingCopyrightStaffCase:counters */
        SELECT submission.copyright_notice_id, submission.id AS submission_id, submission.received_at, submission.body_ciphertext,
          guidance.guidance_ciphertext, run.id AS run_id, run.status AS run_status
        FROM copyright_notice_submissions submission
        LEFT JOIN LATERAL (
          SELECT guidance_ciphertext FROM copyright_notice_submission_guidance
          WHERE copyright_notice_submission_id = submission.id ORDER BY id DESC LIMIT 1
        ) guidance ON true
        LEFT JOIN LATERAL (SELECT id, status FROM copyright_notice_submission_guidance_runs WHERE copyright_notice_submission_id = submission.id ORDER BY id DESC LIMIT 1) run ON true
        LEFT JOIN copyright_notice_counter_notice_reviews review ON review.copyright_notice_submission_id = submission.id
        WHERE submission.copyright_notice_id = ANY(${noticeIds}::uuid[]) AND submission.kind = 'counter_notice' AND review.id IS NULL
          AND (
            ${cursor?.id ?? null}::uuid IS NULL
            OR (submission.received_at, submission.id)
              > (${cursor?.receivedAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
          )
        ORDER BY submission.received_at ASC, submission.id ASC
        LIMIT ${limit}
      `)
      return page
    },
    row => ({ receivedAt: row.received_at, id: row.submission_id }),
  )
  const targetsBySubmission = await selectSubmissionTargetIdsBySubmission(
    query,
    rows.map(row => row.submission_id),
  )
  return groupByNotice(
    rows.map(row => ({
      copyright_notice_id: row.copyright_notice_id,
      submission_id: row.submission_id,
      received_at: row.received_at,
      target_ids: targetsBySubmission.get(row.submission_id) ?? [],
      guidance: parseStoredCopyrightSubmissionGuidance(
        row.guidance_ciphertext,
        row.submission_id,
        'counter_notice',
      ),
      ai_run: toCopyrightAiRun(row.run_id, row.run_status),
      statement: parseStatement(
        decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.submission_id)),
      ),
    })),
  )
}

function parseAppeal(value: string): { reason: string } {
  const parsed = JSON.parse(value) as { reason?: unknown }
  if (typeof parsed.reason !== 'string') throw new TypeError('Stored copyright appeal is invalid')
  return { reason: parsed.reason }
}

export function parseStatement(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new TypeError('Stored copyright counter-notice is invalid')
  return parsed as Record<string, unknown>
}
