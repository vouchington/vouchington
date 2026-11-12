import { COPYRIGHT_ERASED_KEY_PREFIX } from './email-erased-key.mts'
import type { CopyrightEmailIntake } from './email-intakes.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightEmailThreadGraph } from './email-thread-graph.mts'

export function logCopyrightEmailGraphOverflow(
  noticeId: string,
  graph: CopyrightEmailThreadGraph,
): void {
  console.info('copyright_email_thread_graph_overflow', {
    noticeId,
    observedRows: graph.observedRows,
  })
}

export function logCopyrightEmailTokenOverflow(noticeId: string, maxRows: number): void {
  console.info('copyright_email_thread_token_overflow', {
    noticeId,
    observedRows: maxRows + 1,
  })
}

export async function assertNoThreadCorrespondenceDecision(
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
    FROM copyright_notice_email_intake_notice_links decided_link
    WHERE decided_link.copyright_notice_email_intake_id = ${intakeId}
      AND decided_link.correspondence_action IN ('admitted', 'rejected')
    LIMIT 1
  `)
  assert(!rows[0], 409, 'Thread-linked copyright email cannot be approved as an initial intake')
}

export async function assertRecommendationScope(
  transaction: TransactionQuery,
  recommendationId: string | null,
  intakeId: string,
): Promise<void> {
  if (!recommendationId) return
  const { rows } = await transaction<{
    id: string
  }>(sql`/* promoteCopyrightEmailIntake:recommendation */
    SELECT id FROM copyright_notice_email_intake_recommendation_identities
    WHERE id = ${recommendationId} AND copyright_notice_email_intake_receipt_id = ${intakeId}
  `)
  assert(rows[0], 422, 'Email recommendation does not belong to this intake')
}

export async function assertLiveCopyrightPromotionSource(
  transaction: TransactionQuery,
  intakeId: string,
) {
  const { rows: existing } = await transaction<{ id: string }>(sql`
  /* promoteCopyrightEmailIntake:exists */
  SELECT intake.id FROM copyright_notice_email_intakes intake
  JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
  WHERE intake.id = ${intakeId} AND receipt.erased_at IS NULL
`)
  assert(existing[0], 404, 'Copyright email intake not found')
}

export async function readCopyrightPromotionSource(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<CopyrightEmailIntake> {
  const { rows: intakeRows } =
    await transaction<CopyrightEmailIntake>(sql`/* promoteCopyrightEmailIntake:read */
      SELECT intake.id, intake.amazon_ses_message_id, intake.received_at,
        COALESCE(object.storage_key, ${COPYRIGHT_ERASED_KEY_PREFIX} || intake.id::text) AS raw_storage_key,
        intake.raw_storage_object_id, intake.raw_sha256, intake.raw_media_type_id,
        (SELECT mime_type FROM media_types WHERE id = intake.raw_media_type_id) AS raw_mime_type, intake.raw_byte_size
      FROM copyright_notice_email_intakes intake
      LEFT JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
      WHERE intake.id = ${intakeId}
    `)
  const intake = intakeRows[0]
  assert(intake, 404, 'Copyright email intake not found')
  return intake
}
