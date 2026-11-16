import { lockCopyrightActionGenerationForWrite } from './action-delivery-generation.mts'
import type { TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { resolveCopyrightEmailThreadTokenIds } from './email-thread-ancestors.mts'
import { throwIfCopyrightEmailThreadWriteConflict } from './email-thread-write-conflict.mts'
import { COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE } from './email-thread-references.mts'
import { getCopyrightEmailThreadGraphMaxRows } from './config.mts'
import { readBoundedCopyrightEmailAncestorIds } from './email-thread-ancestor-graph.mts'
import { copyrightEmailThreadChangedError } from './email-thread-graph.mts'
import { maintainCopyrightEmailThreadLinkActivity } from './email-thread-link-activity.mts'

/** New links own their trigger-written generation before case clocks or child writes. */
export async function insertCopyrightEmailIntakeNoticeLink(
  transaction: TransactionQuery,
  input: Parameters<typeof insertCopyrightEmailIntakeNoticeLinkInGenerationScope>[1],
): Promise<boolean> {
  await beginCopyrightEmailLinkWrite(transaction, input.noticeId)
  const result = await insertCopyrightEmailIntakeNoticeLinkInGenerationScope(transaction, input)
  return finishCopyrightEmailLinkWrite(transaction, result)
}

async function beginCopyrightEmailLinkWrite(transaction: TransactionQuery, noticeId: string) {
  await transaction(
    sql`/* insertCopyrightEmailIntakeNoticeLink:savepoint */ SAVEPOINT copyright_email_link_write`,
  )
  await lockCopyrightActionGenerationForWrite(noticeId, transaction)
}

async function finishCopyrightEmailLinkWrite(
  transaction: TransactionQuery,
  result: { linked: boolean; inserted: boolean },
): Promise<boolean> {
  if (!result.inserted)
    await transaction(
      sql`/* insertCopyrightEmailIntakeNoticeLink:rollback */ ROLLBACK TO SAVEPOINT copyright_email_link_write`,
    )
  await transaction(
    sql`/* insertCopyrightEmailIntakeNoticeLink:release */ RELEASE SAVEPOINT copyright_email_link_write`,
  )
  return result.linked
}

async function insertCopyrightEmailIntakeNoticeLinkInGenerationScope(
  transaction: TransactionQuery,
  input: {
    intakeId: string
    noticeId: string
    linkKind: 'initial' | 'thread'
    matchedReference?: string | null
  },
): Promise<{ linked: boolean; inserted: boolean }> {
  let authorizingAncestorIntakeIds: readonly string[] = []
  let matchedTokenId: string | null = null
  if (input.matchedReference) {
    const digest = hashToken(COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE, input.matchedReference)
    matchedTokenId = (await resolveCopyrightEmailThreadTokenIds(transaction, [digest])).get(digest)!
  }
  // Existing links replay without maintaining the clock for a new assignment.
  if (input.linkKind === 'thread') {
    const { rows: live } = await transaction<{
      raw_storage_object_id: string | null
      reviewed: boolean
    }>(sql`/* linkCopyrightEmailIntakeToNotice:liveThreadIntake */
      SELECT intake.raw_storage_object_id, receipt.review_decision IS NOT NULL AS reviewed
      FROM copyright_notice_email_intakes intake
      JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
      WHERE intake.id = ${input.intakeId} AND receipt.erased_at IS NULL
    `)
    if (live.length === 0) return { linked: false, inserted: false }
    const { rows: retained } = await transaction<{
      copyright_notice_id: string
      link_kind: string
    }>(sql`/* linkCopyrightEmailIntakeToNotice:existingThread */
      SELECT copyright_notice_id, link_kind FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_id = ${input.intakeId}
    `)
    if (retained[0])
      return {
        linked:
          retained[0].copyright_notice_id === input.noticeId &&
          retained[0].link_kind === input.linkKind,
        inserted: false,
      }
    if (live[0]!.reviewed) return { linked: false, inserted: false }
    if (live[0]!.raw_storage_object_id === null) return { linked: false, inserted: false }
    const { rows: notices } =
      await transaction(sql`/* linkCopyrightEmailIntakeToNotice:liveNotice */
      SELECT id FROM copyright_notices
      WHERE id = ${input.noticeId} AND evidence_erased_at IS NULL LIMIT 1`)
    if (!notices[0]) return { linked: false, inserted: false }
    const { rows: retired } = await transaction(sql`/* linkCopyrightEmailIntakeToNotice:retired */
      SELECT 1 FROM copyright_notice_thread_retention_activities
      WHERE copyright_notice_id = ${input.noticeId}
        AND retired_before_intake_bound > ${input.intakeId}::uuid LIMIT 1`)
    if (retired[0]) return { linked: false, inserted: false }
    const ancestors = await readBoundedCopyrightEmailAncestorIds(
      transaction,
      input.intakeId,
      await getCopyrightEmailThreadGraphMaxRows(),
    )
    if (ancestors === null) throw copyrightEmailThreadChangedError()
    const { rows: changedAncestors } = await transaction(sql`
      /* linkCopyrightEmailIntakeToNotice:authorizingAncestors */
      SELECT 1 FROM unnest(${ancestors}::uuid[]) ancestor(intake_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_id = ancestor.intake_id
          AND link.copyright_notice_id = ${input.noticeId}
      )
      LIMIT 1`)
    if (changedAncestors.length > 0) throw copyrightEmailThreadChangedError()
    authorizingAncestorIntakeIds = ancestors
  } else {
    const { rows: live } = await transaction<{
      raw_storage_object_id: string | null
    }>(sql`/* linkCopyrightEmailIntakeToNotice:liveInitialIntake */
      SELECT raw_storage_object_id FROM copyright_notice_email_intakes
      WHERE id = ${input.intakeId}
        AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
          WHERE receipt.id = ${input.intakeId} AND receipt.erased_at IS NULL)
    `)
    if (live.length === 0) return { linked: false, inserted: false }
    if (live[0]!.raw_storage_object_id === null) {
      const { rows: retained } = await transaction<{
        copyright_notice_id: string
        link_kind: string
      }>(sql`/* linkCopyrightEmailIntakeToNotice:existingInitial */
        SELECT copyright_notice_id, link_kind FROM copyright_notice_email_intake_notice_links
        WHERE copyright_notice_email_intake_id = ${input.intakeId}`)
      return {
        linked:
          retained[0]?.copyright_notice_id === input.noticeId &&
          retained[0]?.link_kind === input.linkKind,
        inserted: false,
      }
    }
  }
  let inserted: Array<{ copyright_notice_id: string; link_kind: string }>
  try {
    const result = await transaction<{
      copyright_notice_id: string
      link_kind: string
    }>(sql`/* linkCopyrightEmailIntakeToNotice */
      INSERT INTO copyright_notice_email_intake_notice_links (
        copyright_notice_email_intake_id, copyright_notice_id, link_kind,
        matched_token_id, correspondence_action
      ) VALUES (
        ${input.intakeId}, ${input.noticeId}, ${input.linkKind},
        ${matchedTokenId}, ${input.linkKind === 'thread' ? 'pending' : null}
      ) ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
      RETURNING copyright_notice_id, link_kind
    `)
    inserted = result.rows
    if (inserted.length > 0 && input.linkKind === 'thread')
      await maintainCopyrightEmailThreadLinkActivity(transaction, {
        noticeId: input.noticeId,
        intakeId: input.intakeId,
        authorizingAncestorIntakeIds,
      })
  } catch (err) {
    throwIfCopyrightEmailThreadWriteConflict(err)
    throw err
  }
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
  return { linked, inserted: inserted.length > 0 }
}
