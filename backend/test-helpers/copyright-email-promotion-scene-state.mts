import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { readCopyrightAssessmentRaceState } from './copyright-assessment-race-outcomes.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readTestRepeatInfringerAccountState } from './copyright-repeat-infringer.mts'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import type { PromoteCopyrightEmailIntakeInput } from '../services/copyright-notices/email-promotion-input.mts'

export type PromotionScene = {
  input: PromoteCopyrightEmailIntakeInput
  intakeIds: string[]
  parentNoticeIds?: string[]
}
/** Every source/decision/link/evidence row is scoped to the unique receipt graph and work description. */
export async function readCopyrightPromotionScene(scene: PromotionScene) {
  const { input, intakeIds } = scene
  const [
    { rows: intakes },
    { rows: links },
    { rows: reviews },
    { rows: evidence },
    { rows: candidates },
    { rows: references },
    { rows: ancestors },
    { rows: posterRows },
  ] = await Promise.all([
    write<{
      id: string
      ses: string
      storage: string
      sha: Buffer
      media: string
      size: number
      decision: string | null
      reviewer: string | null
      reviewed: Date | null
      rationale: string | null
    }>(sql`/* promotionScene:intakes */
      SELECT intake.id, intake.amazon_ses_message_id AS ses, intake.raw_storage_object_id AS storage,
        intake.raw_sha256 AS sha, intake.raw_media_type_id AS media, intake.raw_byte_size AS size,
        receipt.review_decision AS decision, receipt.reviewed_by_id AS reviewer, receipt.reviewed_at AS reviewed, receipt.review_rationale_ciphertext AS rationale
      FROM copyright_notice_email_intakes intake JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
      WHERE intake.id = ANY(${intakeIds}::uuid[]) ORDER BY intake.id`),
    write<{
      intake: string
      notice: string
      kind: string
      action: string | null
      matched: string | null
    }>(sql`/* promotionScene:links */
      SELECT link.copyright_notice_email_intake_id AS intake, link.copyright_notice_id AS notice,
        link.link_kind AS kind, link.correspondence_action AS action, token.lookup_digest AS matched
      FROM copyright_notice_email_intake_notice_links link LEFT JOIN copyright_notice_email_thread_tokens token ON token.id = link.matched_token_id
      WHERE link.copyright_notice_email_intake_id = ANY(${intakeIds}::uuid[]) ORDER BY link.copyright_notice_email_intake_id`),
    write<{
      intake: string
      notice: string
      reviewer: string
      recommendation: string | null
      decision: string
      matchesReceipt: boolean
    }>(sql`/* promotionScene:reviews */
      SELECT review.copyright_notice_email_intake_receipt_id AS intake, review.promoted_copyright_notice_id AS notice,
        review.reviewed_by_id AS reviewer, review.copyright_notice_email_intake_recommendation_id AS recommendation, review.decision,
        (review.reviewed_at = receipt.reviewed_at AND review.reviewed_by_id = receipt.reviewed_by_id
          AND review.rationale_ciphertext = receipt.review_rationale_ciphertext AND review.decision = receipt.review_decision) AS "matchesReceipt"
      FROM copyright_notice_email_intake_reviews review JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = review.copyright_notice_email_intake_receipt_id
      WHERE review.copyright_notice_email_intake_receipt_id = ANY(${intakeIds}::uuid[]) ORDER BY review.id`),
    write<{
      submission: string
      storage: string
      sha: Buffer
      media: string
      size: number
    }>(sql`/* promotionScene:evidence */
      SELECT copyright_notice_submission_id AS submission, storage_object_id AS storage, sha256 AS sha, media_type_id AS media, byte_size AS size
      FROM copyright_notice_evidence_artifacts WHERE storage_object_id IN (
        SELECT raw_storage_object_id FROM copyright_notice_email_intakes WHERE id = ANY(${intakeIds}::uuid[])) ORDER BY id`),
    write<{ id: string; clock: Date }>(sql`/* promotionScene:candidates */
      SELECT id, last_legal_activity_at AS clock FROM copyright_notices WHERE work_description = ${input.workDescription} ORDER BY id`),
    write(sql`/* promotionScene:references */ SELECT reference.copyright_notice_email_intake_id, reference.reference_kind, token.lookup_digest
      FROM copyright_notice_email_thread_references reference JOIN copyright_notice_email_thread_tokens token ON token.id = reference.token_id
      WHERE reference.copyright_notice_email_intake_id = ANY(${intakeIds}::uuid[])
      ORDER BY reference.copyright_notice_email_intake_id, reference.reference_kind, token.lookup_digest`),
    write(sql`/* promotionScene:ancestors */ SELECT * FROM copyright_notice_email_message_ancestors
      WHERE reply_message_intake_receipt_id = ANY(${intakeIds}::uuid[]) OR ancestor_message_intake_receipt_id = ANY(${intakeIds}::uuid[])
      ORDER BY reply_message_intake_receipt_id, ancestor_message_intake_receipt_id`),
    write<{ id: string }>(
      sql`/* promotionScene:poster */ SELECT created_by_id AS id FROM images WHERE id = ${input.targets[0]!.imageId}`,
    ),
  ])
  const posterId = posterRows[0]!.id
  const candidate = candidates[0]
  const aggregate = candidate ? await getCopyrightNoticePrivateAggregate(candidate.id) : null
  const purpose = copyrightEmailIntakePurpose(intakes.find(row => row.id === input.intakeId)!.ses)
  const noticeIds = [...candidates.map(row => row.id), ...(scene.parentNoticeIds ?? [])]
  const [{ rows: incidents }, { rows: provenance }, { rows: clocks }] = await Promise.all([
    write(sql`/* promotionScene:incidents */ SELECT account_user_id AS account, copyright_notice_id AS notice,
      is_operative AS operative, current_disposition AS disposition FROM copyright_repeat_infringer_incidents
      WHERE copyright_notice_id = ANY(${noticeIds}::uuid[]) ORDER BY copyright_notice_id, account_user_id`),
    write(sql`/* promotionScene:provenance */ SELECT incident.account_user_id AS account,
      target.copyright_notice_id AS notice, target.copyright_notice_target_id AS target
      FROM copyright_repeat_infringer_incident_targets target JOIN copyright_repeat_infringer_incidents incident ON incident.id = target.copyright_repeat_infringer_incident_id
      WHERE target.copyright_notice_id = ANY(${noticeIds}::uuid[]) ORDER BY target.copyright_notice_id, incident.account_user_id, target.copyright_notice_target_id`),
    write<{
      id: string
      at: Date
    }>(sql`/* promotionScene:clocks */ SELECT id, last_legal_activity_at AS at FROM copyright_notices
      WHERE id = ANY(${noticeIds}::uuid[]) ORDER BY id`),
  ])
  return {
    intakes: intakes.map(row => ({
      ...row,
      rationale: row.rationale
        ? (JSON.parse(decryptSecret(row.rationale, copyrightEmailIntakePurpose(row.ses))) as {
            rationale: string
            manual_fallback_reason: string | null
          })
        : null,
    })),
    links,
    reviews,
    evidence,
    references,
    ancestors,
    incidents,
    provenance,
    clocks,
    candidateCount: candidates.length,
    accountState: await readTestRepeatInfringerAccountState(posterId),
    parents: await Promise.all(
      (scene.parentNoticeIds ?? []).map(async id => ({
        id,
        aggregate: await getCopyrightNoticePrivateAggregate(id),
        state: await readCopyrightAssessmentRaceState(id),
      })),
    ),
    candidate:
      candidate && aggregate
        ? {
            id: candidate.id,
            legal: await readCopyrightAssessmentRaceState(candidate.id),
            header: {
              jurisdiction: aggregate.notice.jurisdiction,
              claimant: aggregate.notice.claimant_user_id,
              name: aggregate.notice.claimant_display_name,
              contact: decryptSecret(aggregate.notice.claimant_contact_ciphertext!, purpose),
              work: aggregate.notice.work_description,
              policy: aggregate.notice.policy_version,
            },
            submissions: aggregate.submissions.map(row => ({
              id: row.id,
              kind: row.kind,
              source: row.source_kind,
              author: row.submitted_by_id,
              body: JSON.parse(decryptSecret(row.body_ciphertext!, purpose)) as Record<
                string,
                unknown
              >,
            })),
            assessors: aggregate.assessments.map(row => ({
              id: row.id,
              submission: row.copyright_notice_submission_id,
              reviewer: row.assessed_by_id,
              screen: row.copyright_notice_form_screening_id,
            })),
            audits: aggregate.lifecycleEvents.map(row => ({
              kind: row.change_type,
              actor: row.changed_by_id,
              assessment: row.copyright_notice_submission_assessment_identity_id,
              restriction: row.copyright_restriction_id,
            })),
          }
        : null,
    posterId,
  }
}
