/* oxlint-disable max-lines -- Email admission keeps evidence, provenance, threading, and delivery atomic. */
import { beginTransaction } from '@data-stores/psql'
import { observeSharedDbScope } from '@data-stores/psql/shared-db-scope-observer'
import type { TransactionQuery } from '@data-stores/psql/types'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { getOrCreateEmailAssessment } from './email-assessment.mts'
import { createCopyrightNoticeAggregateInTransaction } from './create.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { copyrightEmailIntakePurpose, type CopyrightEmailIntake } from './email-intakes.mts'
import { linkPendingCopyrightEmailRepliesInTransaction } from './email-thread-link-pending.mts'
import {
  assertCopyrightEmailGraphUnchanged,
  copyrightEmailThreadChangedError,
  lockCopyrightEmailGraphIntakes,
  readCopyrightEmailGraphTokens,
  readCopyrightEmailThreadGraph,
  type CopyrightEmailThreadGraph,
} from './email-thread-graph.mts'
import { getCopyrightEmailThreadGraphMaxRows } from './config.mts'
import { lockCopyrightEmailThreadTokens } from './email-thread-ancestors.mts'
import { assertCopyrightEmailUnresolvedReply } from './email-thread-review-path.mts'
import {
  assertStatutoryEmailFields,
  type PromoteCopyrightEmailIntakeInput,
} from './email-promotion-input.mts'
import { copyrightPromotionText, copyrightReceiptText } from './statement-of-reasons-wording.mts'
import { enforceCopyrightAssessment } from './enforce-assessment.mts'
import { COPYRIGHT_ERASED_KEY_PREFIX } from './retention-erasure-spec.mts'

export type { PromoteCopyrightEmailIntakeInput } from './email-promotion-input.mts'

/** A moderator supplies the declarations; advisory extraction is retained only as provenance. */
export async function promoteCopyrightEmailIntake(
  input: PromoteCopyrightEmailIntakeInput,
): Promise<{ noticeId: string; submissionId: string }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assertStatutoryEmailFields(input)
  const admitted = await admitCopyrightEmailIntake(input)
  await assessAndEnforceCopyrightEmailIntake(input, admitted)
  return admitted
}

async function assessAndEnforceCopyrightEmailIntake(
  input: PromoteCopyrightEmailIntakeInput,
  admitted: { noticeId: string; submissionId: string },
): Promise<void> {
  const assessment = await getOrCreateEmailAssessment(input.currentUser, admitted)
  await enforceCopyrightAssessment(assessment.id)
}

async function admitCopyrightEmailIntake(
  input: PromoteCopyrightEmailIntakeInput,
): Promise<{ noticeId: string; submissionId: string }> {
  const maxGraphRows = await getCopyrightEmailThreadGraphMaxRows()
  await using transaction = await beginTransaction()
  const { rows: existing } = await transaction<{ id: string }>(sql`
    /* promoteCopyrightEmailIntake:exists */
    SELECT id FROM copyright_notice_email_intakes WHERE id = ${input.intakeId}
  `)
  assert(existing[0], 404, 'Copyright email intake not found')
  const graph = await readCopyrightEmailThreadGraph(transaction, input.intakeId, maxGraphRows)
  observeSharedDbScope(
    'promoteCopyrightEmailIntakeGraph',
    { kind: 'ids', ids: [input.intakeId] },
    undefined,
    transaction,
  )
  const tokens = graph.overflow
    ? { digests: [], overflow: false }
    : await readCopyrightEmailGraphTokens(transaction, graph.intakeIds, maxGraphRows)
  // Ingestion takes these same sorted token locks before it inserts a reference or an edge.
  // Taking them before intake FOR UPDATE prevents an intake/token lock inversion.
  if (!graph.overflow && !tokens.overflow)
    await lockCopyrightEmailThreadTokens(transaction, tokens.digests)
  await lockCopyrightEmailGraphIntakes(
    transaction,
    graph.overflow || tokens.overflow ? [input.intakeId] : graph.intakeIds,
  )
  observeSharedDbScope(
    'promoteCopyrightEmailIntakeGraphLocked',
    { kind: 'ids', ids: [input.intakeId] },
    undefined,
    transaction,
  )
  if (!graph.overflow && !tokens.overflow) {
    const afterLock = await readCopyrightEmailThreadGraph(transaction, input.intakeId, maxGraphRows)
    assertCopyrightEmailGraphUnchanged(graph, afterLock)
    const afterTokens = await readCopyrightEmailGraphTokens(
      transaction,
      afterLock.intakeIds,
      maxGraphRows,
    )
    if (
      afterTokens.overflow ||
      tokens.digests.length !== afterTokens.digests.length ||
      tokens.digests.some((digest, index) => digest !== afterTokens.digests[index])
    )
      throw copyrightEmailThreadChangedError()
  }
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
  await assertCopyrightEmailUnresolvedReply(transaction, intake.id)
  await assertNoThreadCorrespondenceDecision(transaction, intake.id)
  const { rows: priorPromotions } = await transaction<{
    decision: string
    promoted_copyright_notice_identity_id: string | null
    submission_id: string | null
  }>(
    sql`/* promoteCopyrightEmailIntake:priorPromotion */
      SELECT review.decision, review.promoted_copyright_notice_identity_id, submission.id AS submission_id
      FROM copyright_notice_email_intake_reviews review
      LEFT JOIN copyright_notice_submissions submission
        ON submission.copyright_notice_id = review.promoted_copyright_notice_identity_id
        AND submission.kind = 'notice'
      WHERE copyright_notice_email_intake_id = ${intake.id}
    `,
  )
  const prior = priorPromotions[0]
  if (prior) {
    assert(prior.decision !== 'legal_process', 409, 'Copyright email intake is legal process')
    assert(
      prior.decision === 'approved' &&
        prior.promoted_copyright_notice_identity_id &&
        prior.submission_id,
      409,
      'Copyright email intake was already rejected',
    )
    // ast-grep-ignore: no-three-sequential-awaits -- the case link and reply backfill must commit before returning an idempotent promotion.
    const { rows: replayLinks } = await transaction<{
      copyright_notice_id: string
      link_kind: string
    }>(sql`/* promoteCopyrightEmailIntake:initialThreadLink */
      INSERT INTO copyright_notice_email_intake_notice_links (
        copyright_notice_email_intake_id, copyright_notice_id, link_kind
      ) VALUES (${intake.id}, ${prior.promoted_copyright_notice_identity_id}, 'initial')
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
      retainedLink?.copyright_notice_id === prior.promoted_copyright_notice_identity_id &&
        retainedLink.link_kind === 'initial',
      409,
      'Copyright email intake was linked concurrently',
    )
    if (shouldLinkReplies)
      await linkPendingCopyrightEmailRepliesInTransaction(
        {
          initialIntakeId: intake.id,
          noticeId: prior.promoted_copyright_notice_identity_id,
          descendantIntakeIds: graph.descendantIntakeIds.filter(id => id !== intake.id),
          graphIntakeIds: graph.intakeIds,
        },
        transaction,
      )
    await transaction.commit()
    if (graph.overflow)
      logCopyrightEmailGraphOverflow(prior.promoted_copyright_notice_identity_id, graph)
    if (tokens.overflow)
      logCopyrightEmailTokenLockOverflow(prior.promoted_copyright_notice_identity_id, maxGraphRows)
    return {
      noticeId: prior.promoted_copyright_notice_identity_id,
      submissionId: prior.submission_id,
    }
  }
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
  if (tokens.overflow) logCopyrightEmailTokenLockOverflow(notice.id, maxGraphRows)
  return { noticeId: notice.id, submissionId }
}

function logCopyrightEmailGraphOverflow(noticeId: string, graph: CopyrightEmailThreadGraph): void {
  console.info('copyright_email_thread_graph_overflow', {
    noticeId,
    observedRows: graph.observedRows,
  })
}

function logCopyrightEmailTokenLockOverflow(noticeId: string, maxRows: number): void {
  console.info('copyright_email_thread_token_lock_overflow', {
    noticeId,
    observedRows: maxRows + 1,
  })
}

async function assertNoThreadCorrespondenceDecision(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<void> {
  const { rows } = await transaction(sql`/* promoteCopyrightEmailIntake:threadReview */
    SELECT 1
    FROM copyright_notice_email_intake_notice_links link
    WHERE link.copyright_notice_email_intake_id = ${intakeId}
      AND link.link_kind = 'thread'
    UNION ALL
    SELECT 1
    FROM copyright_notice_email_correspondence_reviews review
    WHERE review.copyright_notice_email_intake_id = ${intakeId}
      AND review.action IN ('admitted', 'rejected')
    LIMIT 1
  `)
  assert(!rows[0], 409, 'Thread-linked copyright email cannot be approved as an initial intake')
}

async function assertRecommendationScope(
  transaction: TransactionQuery,
  recommendationId: string | null,
  intakeId: string,
): Promise<void> {
  if (!recommendationId) return
  const { rows } = await transaction<{
    id: string
  }>(sql`/* promoteCopyrightEmailIntake:recommendation */
    SELECT id FROM copyright_notice_email_intake_recommendations
    WHERE id = ${recommendationId} AND copyright_notice_email_intake_id = ${intakeId}
  `)
  assert(rows[0], 422, 'Email recommendation does not belong to this intake')
}

function buildEmailNotice(
  input: PromoteCopyrightEmailIntakeInput,
  purpose: string,
  receivedAt: Date,
) {
  return {
    jurisdiction: input.jurisdiction,
    receivedAt,
    claimantUserId: null,
    claimantDisplayName: input.claimantDisplayName,
    claimantContactCiphertext: encryptSecret(input.claimantContact, purpose),
    workDescription: input.workDescription,
    policyVersion: 'copyright-email-moderated-v1',
    targets: input.targets,
    initialSubmission: {
      kind: 'notice' as const,
      sourceKind: 'email' as const,
      bodyCiphertext: encryptSecret(
        JSON.stringify({
          has_good_faith_belief: input.goodFaithBelief,
          has_accuracy_authority_under_penalty_of_perjury:
            input.accuracyAuthorityUnderPenaltyOfPerjury,
          electronic_signature: input.electronicSignature,
        }),
        purpose,
      ),
    },
  }
}

async function recordEmailPromotion(
  transaction: TransactionQuery,
  intake: CopyrightEmailIntake,
  noticeId: string,
  input: PromoteCopyrightEmailIntakeInput,
  purpose: string,
  graph: CopyrightEmailThreadGraph,
  shouldLinkReplies: boolean,
): Promise<string> {
  const { rows } = await transaction<{
    id: string
  }>(sql`/* promoteCopyrightEmailIntake:submission */
    SELECT id FROM copyright_notice_submissions WHERE copyright_notice_id = ${noticeId} AND kind = 'notice'
  `)
  const submission = rows[0]
  assert(submission, 500, 'Email copyright submission was not created')
  // ast-grep-ignore: no-three-sequential-awaits -- immutable evidence, human review, thread linking, and delivery obligations are ordered in one transaction.
  await transaction(sql`/* promoteCopyrightEmailIntake:evidence */
    INSERT INTO copyright_notice_evidence_artifacts (copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size)
    VALUES (${submission.id}, ${intake.raw_storage_object_id}, ${intake.raw_sha256}, ${intake.raw_media_type_id}, ${intake.raw_byte_size})
  `)
  await transaction(sql`/* promoteCopyrightEmailIntake:review */
    INSERT INTO copyright_notice_email_intake_reviews (
      copyright_notice_email_intake_id, copyright_notice_email_intake_recommendation_id, reviewed_at,
      reviewed_by_id, decision, rationale_ciphertext, promoted_copyright_notice_identity_id
    ) VALUES (${intake.id}, ${input.recommendationId}, CURRENT_TIMESTAMP, ${input.currentUser.id}, 'approved',
      ${encryptSecret(
        JSON.stringify({
          rationale: input.rationale,
          manual_fallback_reason: input.manualFallbackReason,
        }),
        purpose,
      )}, ${noticeId})
  `)
  const { rows: initialLinks } = await transaction<{ copyright_notice_email_intake_id: string }>(
    sql`/* promoteCopyrightEmailIntake:initialThreadLink */
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind
    ) VALUES (${intake.id}, ${noticeId}, 'initial')
    ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
    RETURNING copyright_notice_email_intake_id
  `,
  )
  assert(initialLinks[0], 409, 'Copyright email intake was linked concurrently')
  if (shouldLinkReplies)
    await linkPendingCopyrightEmailRepliesInTransaction(
      {
        initialIntakeId: intake.id,
        noticeId,
        descendantIntakeIds: graph.descendantIntakeIds.filter(id => id !== intake.id),
        graphIntakeIds: graph.intakeIds,
      },
      transaction,
    )
  const { rows: arrivalReceipt } = await transaction<{
    id: string
  }>(sql`/* recordEmailPromotion:arrivalReceipt */
    SELECT id FROM copyright_notice_delivery_work_items WHERE copyright_notice_email_intake_id = ${intake.id}
      AND delivery_kind = 'email_intake_received' AND state NOT IN ('failed', 'bounced')
  `)
  const claimantReceipt = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId,
      submissionId: submission.id,
      correspondenceKind: 'receipt',
      bodyText: arrivalReceipt[0]
        ? copyrightPromotionText(noticeId)
        : copyrightReceiptText(noticeId),
    },
    transaction,
  )
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId: submission.id,
      correspondenceId: claimantReceipt.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'email',
      idempotencyKey: `copyright-email-intake:${intake.id}:claimant-receipt`,
      recipientEmail: input.claimantEmail,
    },
    transaction,
  )
  return submission.id
}
