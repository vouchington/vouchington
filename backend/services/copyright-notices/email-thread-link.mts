import type { TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import {
  lockCopyrightEmailThreadTokens,
  resolveCopyrightEmailThreadTokenIds,
} from './email-thread-ancestors.mts'
import { COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE } from './email-thread-references.mts'

export type CopyrightEmailIntakeNoticeLink = {
  intakeId: string
  noticeId: string
  linkKind: 'initial' | 'thread'
  matchedReference?: string | null
}

export async function insertCopyrightEmailIntakeNoticeLink(
  transaction: TransactionQuery,
  input: CopyrightEmailIntakeNoticeLink,
): Promise<boolean> {
  let matchedTokenId: string | null = null
  if (input.matchedReference) {
    const digest = hashToken(COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE, input.matchedReference)
    await lockCopyrightEmailThreadTokens(transaction, [digest])
    matchedTokenId = (await resolveCopyrightEmailThreadTokenIds(transaction, [digest])).get(digest)!
  }
  // A new thread link must serialize with retention on the notice. Locking its intake
  // first also preserves promotion's order. If it was linked while we waited, replay
  // the immutable link without requesting a notice lock: erasure may hold that notice
  // while updating already-linked intakes.
  if (input.linkKind === 'thread') {
    const { rows: live } = await transaction<{
      raw_storage_object_id: string | null
    }>(sql`/* linkCopyrightEmailIntakeToNotice:lockThreadIntake */
      SELECT raw_storage_object_id FROM copyright_notice_email_intakes
      WHERE id = ${input.intakeId}
        AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
          WHERE receipt.id = ${input.intakeId} AND receipt.erased_at IS NULL)
      FOR UPDATE
    `)
    if (live.length === 0) return false
    const { rows: retained } = await transaction<{
      copyright_notice_id: string
      link_kind: string
    }>(sql`/* linkCopyrightEmailIntakeToNotice:existingThread */
      SELECT copyright_notice_id, link_kind FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_id = ${input.intakeId}
    `)
    if (retained[0])
      return (
        retained[0].copyright_notice_id === input.noticeId &&
        retained[0].link_kind === input.linkKind
      )
    if (live[0]!.raw_storage_object_id === null) return false
    const { rows: notices } =
      await transaction(sql`/* linkCopyrightEmailIntakeToNotice:lockNotice */
      SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR KEY SHARE
    `)
    if (!notices[0]) return false
    // A fresh READ COMMITTED statement sees a marker committed while the notice
    // lock was pending. The lock then fences erasure through this transaction.
    const { rows: erased } = await transaction(sql`/* linkCopyrightEmailIntakeToNotice:erasure */
      SELECT 1 FROM copyright_notice_retention_erasures
      WHERE copyright_notice_id = ${input.noticeId} LIMIT 1
    `)
    if (erased[0]) return false
    const { rows: retired } = await transaction(sql`/* linkCopyrightEmailIntakeToNotice:retired */
      SELECT 1 FROM copyright_notice_email_thread_retirements
      WHERE copyright_notice_id = ${input.noticeId}
        AND retired_before_intake_bound > ${input.intakeId}::uuid LIMIT 1`)
    if (retired[0]) return false
  } else {
    // The initial link keeps its KEY SHARE fence against a competing promotion.
    const { rows: live } = await transaction<{
      raw_storage_object_id: string | null
    }>(sql`/* linkCopyrightEmailIntakeToNotice:lockIntake */
      SELECT raw_storage_object_id FROM copyright_notice_email_intakes
      WHERE id = ${input.intakeId}
        AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
          WHERE receipt.id = ${input.intakeId} AND receipt.erased_at IS NULL)
      FOR KEY SHARE
    `)
    if (live.length === 0) return false
    if (live[0]!.raw_storage_object_id === null) {
      const { rows: retained } = await transaction<{
        copyright_notice_id: string
        link_kind: string
      }>(sql`/* linkCopyrightEmailIntakeToNotice:existingInitial */
        SELECT copyright_notice_id, link_kind FROM copyright_notice_email_intake_notice_links
        WHERE copyright_notice_email_intake_id = ${input.intakeId}`)
      return (
        retained[0]?.copyright_notice_id === input.noticeId &&
        retained[0]?.link_kind === input.linkKind
      )
    }
  }
  const { rows: inserted } = await transaction<{
    copyright_notice_id: string
    link_kind: string
  }>(sql`/* linkCopyrightEmailIntakeToNotice */
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind,
      matched_token_id
    ) VALUES (
      ${input.intakeId}, ${input.noticeId}, ${input.linkKind},
      ${matchedTokenId}
    ) ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
    RETURNING copyright_notice_id, link_kind
  `)
  const retained =
    inserted[0] ??
    (
      await transaction<{ copyright_notice_id: string; link_kind: string }>(sql`
      /* linkCopyrightEmailIntakeToNotice:retained */
      SELECT copyright_notice_id, link_kind FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_id = ${input.intakeId}
    `)
    ).rows[0]
  const linked =
    !!inserted[0] ||
    (retained?.copyright_notice_id === input.noticeId && retained?.link_kind === input.linkKind)
  if (input.linkKind === 'thread' && linked) {
    await transaction(sql`/* linkCopyrightEmailIntakeToNotice:pendingReview */
      INSERT INTO copyright_notice_email_correspondence_reviews (
        copyright_notice_email_intake_id, copyright_notice_id, action
      ) VALUES (${input.intakeId}, ${input.noticeId}, 'pending')
      ON CONFLICT (copyright_notice_email_intake_id, action) DO NOTHING
    `)
  }
  return linked
}
