import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestGuestEuCase } from './copyright-eu-guest-cases.mts'
import {
  recordEuCopyrightRedressDecision,
  recordEuCopyrightSupervisedComplaint,
  submitEuCopyrightRedress,
} from '../services/copyright-notices/index.mts'
import {
  closeCopyrightTerritorialEscalation,
  resolveCopyrightEuSupervisedComplaint,
} from '../services/copyright-notices/retention-review-closures.mts'
import { compileEuCopyrightTransparencyReport } from '../services/copyright-notices/eu-reporting.mts'
import { sendAllCopyrightDeliveries } from './services/copyright-notices/retention-deliveries.mts'

export type StoredCopyrightEuTransparencyReport = {
  id: string
  period_started_at: Date
  period_ended_at: Date
  receipt_count: number
  statement_of_reasons_count: number
  redress_request_count: number
  redress_decision_count: number
  supervised_complaint_count: number
  escalation_count: number
  previous_report_id: string | null
  source_generation: string
  method_snapshot: Record<string, unknown>
  stored_row: Record<string, unknown>
}

/** A complete, settled EU case whose six report facts are materialized before retention. */
export async function createSettledCopyrightEuReportCase(
  periodStartedAt: Date,
  periodEndedAt: Date,
) {
  const scene = await createTestGuestEuCase('decided')
  const redress = await submitEuCopyrightRedress(
    scene.staff,
    scene.noticeId,
    crypto.randomUUID(),
    'Please review the no-action decision.',
  )
  await recordEuCopyrightRedressDecision(scene.staff, scene.noticeId, redress.id, {
    disposition: 'maintain',
    rationale: 'The no-action decision remains appropriate.',
  })
  const complaint = await recordEuCopyrightSupervisedComplaint(scene.staff, scene.noticeId, {
    idempotencyKey: crypto.randomUUID(),
    authorityReference: `DSC-${crypto.randomUUID()}`,
    explanation: 'A supervised complaint was submitted for review.',
  })
  await resolveCopyrightEuSupervisedComplaint(scene.staff, scene.noticeId, complaint.id)
  await closeCopyrightTerritorialEscalation(scene.staff, scene.noticeId, complaint.escalation_id)
  await sendAllCopyrightDeliveries(scene.noticeId)
  const report = await compileEuCopyrightTransparencyReport(
    scene.staff,
    periodStartedAt,
    periodEndedAt,
  )
  return { ...scene, report }
}

/** Reads only exact-period aggregate reports and their stored aggregate-only row shape. */
export async function readCopyrightEuTransparencyReports(
  periodStartedAt: Date,
  periodEndedAt: Date,
): Promise<StoredCopyrightEuTransparencyReport[]> {
  const { rows } = await read<StoredCopyrightEuTransparencyReport>(sql`
    /* readCopyrightEuTransparencyReports */
    SELECT id, period_started_at, period_ended_at, receipt_count,
      statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count, previous_report_id,
      source_generation, method_snapshot, to_jsonb(report) AS stored_row
    FROM copyright_eu_transparency_reports report
    WHERE period_started_at = ${periodStartedAt} AND period_ended_at = ${periodEndedAt}
    ORDER BY reported_at, id
  `)
  return rows
}

/** Normal non-notifier admission must reject an absent actor before retaining any row. */
export async function attemptUnattributedCopyrightReviewerRedress(noticeId: string): Promise<void> {
  await write(sql`/* attemptUnattributedCopyrightReviewerRedress */
    INSERT INTO copyright_territorial_redress_requests (
      copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
      submitted_by_id, filed_by, idempotency_key, explanation_ciphertext
    ) SELECT decision.copyright_notice_id, decision.jurisdiction, decision.id,
      NULL, 'reviewer', ${crypto.randomUUID()}, 'unattributed reviewer fixture'
    FROM copyright_territorial_decisions decision
    WHERE decision.copyright_notice_id = ${noticeId} AND decision.supersedes_decision_id IS NULL
    LIMIT 1`)
}
