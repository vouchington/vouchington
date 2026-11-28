import { decryptSecret } from '@modules/token-secrets'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { toCopyrightAiRun, type CopyrightAiRun } from './ai-run-types.mts'
import { collectKeysetPages } from './bounded-reads.mts'
import { groupByNotice } from './read-models-staff-group.mts'
import { parseStoredCopyrightSubmissionGuidance } from './read-models-staff-guidance.mts'
import { parseStatement } from './read-models-staff-submissions.mts'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'
import { getCopyrightSweepLimits } from './work-limits.mts'

type LegalHoldSubmissionRow = {
  copyright_notice_id: string
  submission_id: string
  received_at: Date
  body_ciphertext: string
  guidance_ciphertext: string | null
  run_id: string | null
  run_status: CopyrightAiRun['status'] | null
}

type LegalHoldAssessmentRow = {
  copyright_notice_submission_id: string
  assessment_id: string
  assessed_at: Date | null
  is_from_original_claimant: boolean | null
  proceeding_kind: 'federal_court' | 'ccb' | null
  ccb_claim_kind: 'claim' | 'counterclaim' | null
  commenced_at: Date | null
  received_by_designated_agent_at: Date | null
  is_same_material: boolean | null
  resolution_id: string | null
}

export async function selectStaffLegalHolds(
  noticeIds: readonly string[],
  query: TransactionQuery,
): Promise<Map<string, CopyrightStaffCase['legal_holds']>> {
  const { batchSize } = getCopyrightSweepLimits()
  const submissions = await collectKeysetPages<
    LegalHoldSubmissionRow,
    { receivedAt: Date; id: string }
  >(
    batchSize,
    async (cursor, limit) => {
      const { rows } = await query<LegalHoldSubmissionRow>(
        sql`/* getPendingCopyrightStaffCase:legalHolds */
          SELECT submission.copyright_notice_id, submission.id AS submission_id,
            submission.received_at, submission.body_ciphertext,
            guidance.guidance_ciphertext, run.id AS run_id, run.status AS run_status
          FROM copyright_notice_submissions submission
          LEFT JOIN LATERAL (
            SELECT guidance_ciphertext FROM copyright_notice_submission_guidance
            WHERE copyright_notice_submission_id = submission.id ORDER BY id DESC LIMIT 1
          ) guidance ON true
          LEFT JOIN LATERAL (SELECT id, status FROM copyright_notice_submission_guidance_runs WHERE copyright_notice_submission_id = submission.id ORDER BY id DESC LIMIT 1) run ON true
          WHERE submission.copyright_notice_id = ANY(${noticeIds}::uuid[])
            AND submission.kind = 'court_or_ccb_hold'
            AND (
              ${cursor?.id ?? null}::uuid IS NULL
              OR (submission.received_at, submission.id)
                > (${cursor?.receivedAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
            )
          ORDER BY submission.received_at ASC, submission.id ASC
          LIMIT ${limit}
        `,
      )
      return rows
    },
    row => ({ receivedAt: row.received_at, id: row.submission_id }),
  )
  if (submissions.length === 0) return new Map()
  const submissionIds = submissions.map(row => row.submission_id)
  const assessments = await collectKeysetPages<LegalHoldAssessmentRow, string>(
    batchSize,
    async (afterId, limit) => {
      const { rows } = await query<LegalHoldAssessmentRow>(
        sql`/* getPendingCopyrightStaffCase:legalHoldAssessments */
          SELECT assessment.copyright_notice_submission_id, assessment.id AS assessment_id,
            assessment.assessed_at, assessment.is_from_original_claimant,
            assessment.proceeding_kind, assessment.ccb_claim_kind, assessment.commenced_at,
            assessment.received_by_designated_agent_at, assessment.is_same_material,
            resolution.id AS resolution_id
          FROM copyright_notice_legal_hold_assessments assessment
          LEFT JOIN copyright_notice_legal_hold_resolutions resolution
            ON resolution.copyright_notice_legal_hold_assessment_id = assessment.id
          WHERE assessment.copyright_notice_submission_id = ANY(${submissionIds}::uuid[])
            AND (${afterId}::uuid IS NULL OR assessment.id > ${afterId}::uuid)
          ORDER BY assessment.id ASC
          LIMIT ${limit}
        `,
      )
      return rows
    },
    row => row.assessment_id,
  )
  const targetIdsByAssessment = await selectLegalHoldAssessmentTargetIds(
    query,
    assessments.map(row => row.assessment_id),
    batchSize,
  )
  const assessmentsBySubmission = new Map<string, LegalHoldAssessmentRow[]>()
  for (const assessment of assessments) {
    const list = assessmentsBySubmission.get(assessment.copyright_notice_submission_id) ?? []
    list.push(assessment)
    assessmentsBySubmission.set(assessment.copyright_notice_submission_id, list)
  }
  return groupByNotice(
    submissions.flatMap<
      CopyrightStaffCase['legal_holds'][number] & { copyright_notice_id: string }
    >(submission => {
      const base = {
        copyright_notice_id: submission.copyright_notice_id,
        submission_id: submission.submission_id,
        received_at: submission.received_at,
        statement: parseStatement(
          decryptSecret(
            submission.body_ciphertext,
            copyrightSubmissionPurpose(submission.submission_id),
          ),
        ),
        guidance: parseStoredCopyrightSubmissionGuidance(
          submission.guidance_ciphertext,
          submission.submission_id,
          'court_or_ccb_hold',
        ),
        ai_run: toCopyrightAiRun(submission.run_id, submission.run_status),
      }
      const list = assessmentsBySubmission.get(submission.submission_id)
      if (!list || list.length === 0) return [{ ...base, assessment: null }]
      return list.map(row => ({
        ...base,
        assessment: {
          id: row.assessment_id,
          is_from_original_claimant: row.is_from_original_claimant === true,
          proceeding_kind: row.proceeding_kind,
          ccb_claim_kind: row.ccb_claim_kind,
          commenced_at: row.commenced_at,
          received_by_designated_agent_at: row.received_by_designated_agent_at,
          is_same_material: row.is_same_material === true,
          target_ids: targetIdsByAssessment.get(row.assessment_id) ?? [],
          qualifying:
            row.is_from_original_claimant === true &&
            row.proceeding_kind !== null &&
            row.commenced_at !== null &&
            row.received_by_designated_agent_at !== null &&
            row.assessed_at !== null &&
            row.received_by_designated_agent_at <= row.assessed_at &&
            row.is_same_material === true,
          resolved: row.resolution_id !== null,
        },
      }))
    }),
  )
}

async function selectLegalHoldAssessmentTargetIds(
  query: TransactionQuery,
  assessmentIds: readonly string[],
  batchSize: number,
): Promise<Map<string, string[]>> {
  const byAssessment = new Map<string, string[]>()
  if (assessmentIds.length === 0) return byAssessment
  const rows = await collectKeysetPages<
    { copyright_notice_legal_hold_assessment_id: string; copyright_notice_target_id: string },
    { assessmentId: string; targetId: string }
  >(
    batchSize,
    async (cursor, limit) => {
      const { rows: page } = await query<{
        copyright_notice_legal_hold_assessment_id: string
        copyright_notice_target_id: string
      }>(sql`/* getPendingCopyrightStaffCase:legalHoldTargets */
        SELECT copyright_notice_legal_hold_assessment_id, copyright_notice_target_id
        FROM copyright_notice_legal_hold_assessment_targets
        WHERE copyright_notice_legal_hold_assessment_id = ANY(${assessmentIds}::uuid[])
          AND (
            ${cursor?.assessmentId ?? null}::uuid IS NULL
            OR (copyright_notice_legal_hold_assessment_id, copyright_notice_target_id)
              > (${cursor?.assessmentId ?? null}::uuid, ${cursor?.targetId ?? null}::uuid)
          )
        ORDER BY copyright_notice_legal_hold_assessment_id ASC, copyright_notice_target_id ASC
        LIMIT ${limit}
      `)
      return page
    },
    row => ({
      assessmentId: row.copyright_notice_legal_hold_assessment_id,
      targetId: row.copyright_notice_target_id,
    }),
  )
  for (const row of rows) {
    const list = byAssessment.get(row.copyright_notice_legal_hold_assessment_id) ?? []
    list.push(row.copyright_notice_target_id)
    byAssessment.set(row.copyright_notice_legal_hold_assessment_id, list)
  }
  return byAssessment
}
