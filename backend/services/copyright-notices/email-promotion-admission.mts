import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import { conflictOnSerializationFailure } from '@modules/utils/serialization-conflict'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { getCopyrightEmailThreadGraphMaxRows } from './config.mts'
import { createCopyrightNoticeAggregateInTransaction } from './create.mts'
import { COPYRIGHT_ERASED_KEY_PREFIX } from './email-erased-key.mts'
import { copyrightEmailIntakePurpose, type CopyrightEmailIntake } from './email-intakes.mts'
import {
  assertNoThreadCorrespondenceDecision,
  assertRecommendationScope,
  logCopyrightEmailGraphOverflow,
  logCopyrightEmailTokenOverflow,
} from './email-promotion-admission-guards.mts'
import type { PromoteCopyrightEmailIntakeInput } from './email-promotion-input.mts'
import { buildEmailNotice, recordEmailPromotion } from './email-promotion-record.mts'
import {
  readCopyrightEmailGraphTokens,
  readCopyrightEmailThreadGraph,
} from './email-thread-graph.mts'
import { linkPendingCopyrightEmailRepliesInTransaction } from './email-thread-link-pending.mts'
import { assertCopyrightEmailUnresolvedReply } from './email-thread-review-path.mts'

export async function admitCopyrightEmailIntake(input: PromoteCopyrightEmailIntakeInput): Promise<{
  noticeId: string
  submissionId: string
  evidenceErased: boolean
  isDuplicate: boolean
}> {
  const maxGraphRows = await getCopyrightEmailThreadGraphMaxRows()
  return conflictOnSerializationFailure(async () => {
  await using transaction = await beginTransaction({ serializable: true })
  const { rows: existing } = await transaction<{ id: string }>(sql`
    /* promoteCopyrightEmailIntake:exists */
    SELECT intake.id FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
    WHERE intake.id = ${input.intakeId} AND receipt.erased_at IS NULL
  `)
  assert(existing[0], 404, 'Copyright email intake not found')
  const graph = await readCopyrightEmailThreadGraph(transaction, input.intakeId, maxGraphRows)
  const tokens = graph.overflow
    ? { digests: [], overflow: false }
    : await readCopyrightEmailGraphTokens(transaction, graph.intakeIds, maxGraphRows)
  const shouldLinkReplies = !graph.overflow && !tokens.overflow
  const { rows: intakeRows } =
    await transaction<CopyrightEmailIntake>(sql`/* promoteCopyrightEmailIntake:read */
    SELECT intake.id, intake.amazon_ses_message_id, intake.received_at,
      COALESCE(object.storage_key, ${COPYRIGHT_ERASED_KEY_PREFIX} || intake.id::text) AS raw_storage_key,
      intake.raw_storage_object_id, intake.raw_sha256, intake.raw_media_type_id,
      (SELECT mime_type FROM media_types WHERE id = intake.raw_media_type_id) AS raw_mime_type, intake.raw_byte_size
    FROM copyright_notice_email_intakes intake
    LEFT JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
    WHERE intake.id = ${input.intakeId}
  `)
  const intake = intakeRows[0]
  assert(intake, 404, 'Copyright email intake not found')
  const { rows: priorPromotions } = await transaction<{
    decision: string
    promoted_copyright_notice_id: string | null
    submission_id: string | null
    evidence_erased: boolean
  }>(
    sql`/* promoteCopyrightEmailIntake:priorPromotion */
      SELECT receipt.review_decision AS decision,
        link.copyright_notice_id AS promoted_copyright_notice_id, submission.id AS submission_id,
        notice.evidence_erased_at IS NOT NULL AS evidence_erased
      FROM copyright_notice_email_intake_receipts receipt
      LEFT JOIN copyright_notice_email_intake_notice_links link
        ON link.copyright_notice_email_intake_id = receipt.id AND link.link_kind = 'initial'
      LEFT JOIN copyright_notice_submissions submission
        ON submission.copyright_notice_id = link.copyright_notice_id
        AND submission.kind = 'notice' AND submission.source_kind <> 'staff'
      LEFT JOIN copyright_notices notice ON notice.id = link.copyright_notice_id
      WHERE receipt.id = ${intake.id} AND receipt.review_decision IS NOT NULL
    `,
  )
  const prior = priorPromotions[0]
  if (prior) {
    assert(prior.decision !== 'legal_process', 409, 'Copyright email intake is legal process')
    assert(
      prior.decision === 'approved' && prior.promoted_copyright_notice_id && prior.submission_id,
      409,
      'Copyright email intake was already rejected',
    )
    const { rows: replayLinks } = await transaction<{
      copyright_notice_id: string
      link_kind: string
    }>(sql`/* promoteCopyrightEmailIntake:initialThreadLink */
      INSERT INTO copyright_notice_email_intake_notice_links (
        copyright_notice_email_intake_id, copyright_notice_id, link_kind
      ) VALUES (${intake.id}, ${prior.promoted_copyright_notice_id}, 'initial')
      ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
      RETURNING copyright_notice_id, link_kind
    `)
    const retainedLink =
      replayLinks[0] ??
      (
        await transaction<{ copyright_notice_id: string; link_kind: string }>(sql`
        /* promoteCopyrightEmailIntake:retainedInitialLink */
        SELECT copyright_notice_id, link_kind FROM copyright_notice_email_intake_notice_links
        WHERE copyright_notice_email_intake_id = ${intake.id}
      `)
      ).rows[0]
    assert(
      retainedLink?.copyright_notice_id === prior.promoted_copyright_notice_id &&
        retainedLink.link_kind === 'initial',
      409,
      'Copyright email intake was linked concurrently',
    )
    if (shouldLinkReplies && !prior.evidence_erased)
      await linkPendingCopyrightEmailRepliesInTransaction(
        {
          initialIntakeId: intake.id,
          noticeId: prior.promoted_copyright_notice_id,
          descendantIntakeIds: graph.descendantIntakeIds.filter(id => id !== intake.id),
          graphIntakeIds: graph.intakeIds,
        },
        transaction,
      )
    await readCopyrightThreadRetirement(transaction, [prior.promoted_copyright_notice_id])
    await transaction.commit()
    if (graph.overflow) logCopyrightEmailGraphOverflow(prior.promoted_copyright_notice_id, graph)
    if (tokens.overflow)
      logCopyrightEmailTokenOverflow(prior.promoted_copyright_notice_id, maxGraphRows)
    return {
      noticeId: prior.promoted_copyright_notice_id,
      submissionId: prior.submission_id,
      evidenceErased: prior.evidence_erased,
      isDuplicate: true,
    }
  }
  await assertCopyrightEmailUnresolvedReply(transaction, intake.id)
  await assertNoThreadCorrespondenceDecision(transaction, intake.id)
  assert(intake.raw_storage_object_id, 404, 'Copyright email intake not found')
  await assertRecommendationScope(transaction, input.recommendationId, intake.id)
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  const notice = await createCopyrightNoticeAggregateInTransaction(
    buildEmailNotice(input, purpose, intake.received_at),
    transaction,
  )
  const submissionId = await recordEmailPromotion(
    transaction,
    intake,
    notice.id,
    input,
    purpose,
    graph,
    shouldLinkReplies,
  )
  await transaction.commit()
  if (graph.overflow) logCopyrightEmailGraphOverflow(notice.id, graph)
  if (tokens.overflow) logCopyrightEmailTokenOverflow(notice.id, maxGraphRows)
  return { noticeId: notice.id, submissionId, evidenceErased: false, isDuplicate: false }
  }, 'Copyright email changed during admission', COPYRIGHT_EMAIL_THREAD_CHANGED)
}
