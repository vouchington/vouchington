import { getCopyrightNoticesWorkLimit } from '../services/copyright-notices/work-limits.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { expect } from 'vitest'
import { createCopyrightNoticeNotification } from '../services/notifications/index.mts'
import { getCopyrightStatementInAppSummary } from '../services/copyright-notices/statement-in-app-summary.mts'
import { copyrightInAppDecisionWasAiAssisted } from '../services/copyright-notices/ai-assistance-disclosure.mts'
import {
  copyrightNotificationCopy,
  COPYRIGHT_AI_ASSISTED_SENTENCE,
} from '../services/copyright-notices/statement-of-reasons-wording.mts'
import { getCopyrightNoticeJurisdiction } from '../services/copyright-notices/notice-jurisdiction.mts'
import { insertCopyrightDeliveryRecipient } from '../services/copyright-notices/delivery-intents.mts'
import { getCopyrightEmailCorrespondence } from '../services/copyright-notices/correspondence.mts'
import { getVerifiedEmailAddress } from '../services/contribution-gating/index.mts'
import {
  readStatementTransportState,
  statementInAppKind,
} from './copyright-statement-transport-state.mts'

/** A committed claim is a dependency of finalize/projection tests, never a repeat of their worker. */
export async function seedStatementTransportClaim(intentId: string) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ lease_token: string }>(sql`/* seedStatementTransportClaim */
    UPDATE copyright_notice_delivery_work_items SET lease_token = uuidv7(), leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${getCopyrightNoticesWorkLimit('delivery_lease_minutes')} * INTERVAL '1 minute', delivery_attempted_at = CURRENT_TIMESTAMP,
      available_at = clock_timestamp(), attempt_count = attempt_count + 1, failure_ciphertext = NULL
    WHERE id = ${intentId} AND state = 'pending' RETURNING lease_token`)
  const token = rows[0]?.lease_token
  if (!token) throw new Error('Owned statement fixture was not pending')
  await transaction.commit()
  return token
}

/** Complete independent transport facts let the actual notification/read-model consumers always run. */
export async function seedStatementTransportSent(intentId: string) {
  const before = await readStatementTransportState(intentId)
  const work = before.state.work
  if (!work.copyright_notice_id) throw new Error('Owned statement has no notice')
  const token = await seedStatementTransportClaim(intentId)
  if (work.channel === 'in_app') {
    if (!work.recipient_user_id) throw new Error('Owned statement has no member recipient')
    const [summary, jurisdiction] = await Promise.all([
      getCopyrightStatementInAppSummary(intentId),
      getCopyrightNoticeJurisdiction(work.copyright_notice_id),
    ])
    const copy = copyrightNotificationCopy(statementInAppKind(work.delivery_kind), jurisdiction)
    const assisted =
      work.delivery_kind === 'status_update' &&
      (await copyrightInAppDecisionWasAiAssisted(intentId))
    await createCopyrightNoticeNotification({
      statementCopy: {
        title: copy.title,
        body: (summary ?? copy.body) + (assisted ? `\n\n${COPYRIGHT_AI_ASSISTED_SENTENCE}` : ''),
      },
      userId: work.recipient_user_id,
      noticeId: work.copyright_notice_id,
      eventKey: `copyright-delivery:${intentId}`,
      targetPath: work.target_path ?? undefined,
    })
  } else {
    const rendered = await getCopyrightEmailCorrespondence(intentId)
    expect(rendered.bodyText.length).toBeGreaterThan(0)
    const email =
      before.state.email ??
      (work.recipient_user_id ? await getVerifiedEmailAddress(work.recipient_user_id) : null)
    if (!email) throw new Error('Owned statement has no retained or member email')
    await using recipient = await beginTransaction()
    await insertCopyrightDeliveryRecipient(email, intentId, recipient)
    await recipient.commit()
  }
  await using transaction = await beginTransaction()
  const { rowCount } = await transaction(sql`/* seedStatementTransportSent */
    UPDATE copyright_notice_delivery_work_items SET sent_at = CURRENT_TIMESTAMP,
      amazon_ses_message_id = ${work.channel === 'email' ? `statement-${crypto.randomUUID()}` : null}
    WHERE id = ${intentId} AND state = 'claimed' AND lease_token = ${token}
      AND lease_expires_at > clock_timestamp()`)
  if (rowCount !== 1) throw new Error('Owned statement completion lost its committed lease')
  await transaction.commit()
}
