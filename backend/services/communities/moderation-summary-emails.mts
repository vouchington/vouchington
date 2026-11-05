import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMarketingPostalAddress, getSiteUrl } from '@modules/utils'
import onError from '@modules/on-error'
import { enqueueSendCommunityModerationSummaryEmail } from '@queues/email-digests/enqueues'
import { createEmailUnsubscribeUrl } from '@services/users'
import type { CommunityModerationSummaryEmailProps } from '@email-templates/core'
import pMap from 'p-map'
import { getModerationSummaryRecipients } from './moderation-summary-recipients.mts'
import {
  buildModerationSendKey,
  formatLocalDate,
  getModerationActivityWindowStart,
  isModerationEmailDue,
  type ModerationRecipientRow,
} from './moderation-summary-schedule.mts'
import { getCommunityModerationSummaryCommunities } from './moderation-summary-communities.mts'

export async function dispatchCommunityModerationSummaryEmails(now = new Date()): Promise<void> {
  const recipients = await getModerationSummaryRecipients(now)
  await pMap(recipients, recipient => dispatchModerationSummary(recipient, now), {
    concurrency: 1,
    stopOnError: false,
  })
}

async function dispatchModerationSummary(
  recipient: ModerationRecipientRow,
  now: Date,
): Promise<void> {
  let sendKey: string | null = null
  try {
    if (!isModerationEmailDue(recipient, now)) return

    const windowStart = getModerationActivityWindowStart(recipient.moderation_email_cadence, now)
    const communities = await getCommunityModerationSummaryCommunities(
      recipient.id,
      windowStart,
      now,
      now,
    )
    if (communities.length === 0) return

    sendKey = buildModerationSendKey(recipient, now)
    if (!(await claimModerationEmailSend(recipient.id, sendKey))) return

    const props = {
      userName: recipient.username ?? undefined,
      generatedForDate: formatLocalDate(now, recipient.moderation_email_timezone),
      dispatchTimeZone: recipient.moderation_email_timezone,
      settingsUrl: getSiteUrl('/my/notification-settings'),
      unsubscribeUrl: createEmailUnsubscribeUrl(recipient.id, 'community_digest'),
      physicalAddress: getMarketingPostalAddress(),
      communities,
    } satisfies CommunityModerationSummaryEmailProps & { dispatchTimeZone: string }
    await enqueueSendCommunityModerationSummaryEmail(
      {
        userId: recipient.id,
        trackingKey: sendKey,
        windowStart: windowStart.toISOString(),
        windowEnd: now.toISOString(),
        uiLocale: recipient.ui_locale ?? null,
      },
      props,
    )
  } catch (err) {
    /* c8 ignore start -- Defensive cleanup/observability for per-recipient enqueue failures. */
    if (sendKey) await releaseModerationClaim(recipient.id, sendKey)
    reportModerationDispatchError(err, recipient.id)
    /* c8 ignore stop */
  }
}

/* c8 ignore start -- Only called from defensive moderation dispatch cleanup paths. */
async function releaseModerationClaim(userId: string, sendKey: string): Promise<void> {
  try {
    await releaseUnsentModerationEmailClaim(userId, sendKey)
  } catch (err) {
    reportModerationDispatchError(err, userId)
  }
}

function reportModerationDispatchError(error: unknown, userId: string): void {
  const reportableError = error instanceof Error ? error : new Error(String(error))
  Object.assign(reportableError, {
    tags: { worker: 'moderation-summary-email-dispatch' },
    extra: { userId },
  })
  onError(reportableError)
}
/* c8 ignore stop */

export async function isModerationEmailsEnabled(userId: string): Promise<boolean> {
  const { rows } = await read<{ is_moderation_emails_enabled: boolean }>(
    sql`/* isModerationEmailsEnabled */
      SELECT is_moderation_emails_enabled
      FROM users
      WHERE id = ${userId}
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_suspensions us WHERE us.user_id = users.id AND us.lifted_at IS NULL
        )
      LIMIT 1
    `,
  )
  return rows.at(0)?.is_moderation_emails_enabled ?? false
}

export async function getModerationEmailCadence(
  userId: string,
): Promise<ModerationRecipientRow['moderation_email_cadence']> {
  const { rows } = await read<{
    moderation_email_cadence: ModerationRecipientRow['moderation_email_cadence']
  }>(
    sql`/* getModerationEmailCadence */
      SELECT COALESCE(moderation_email_cadence, 'weekly') AS moderation_email_cadence
      FROM view_users_private
      WHERE id = ${userId}
      LIMIT 1
    `,
  )
  return rows[0]?.moderation_email_cadence ?? 'weekly'
}

async function claimModerationEmailSend(userId: string, sendKey: string): Promise<boolean> {
  const { rows } = await write(sql`/* claimModerationEmailSend */
    INSERT INTO user_moderation_email_sends (user_id, send_key)
    VALUES (${userId}, ${sendKey})
    ON CONFLICT DO NOTHING
    RETURNING user_id
  `)
  return rows.length > 0
}

export async function markModerationEmailSent(userId: string, sendKey: string): Promise<boolean> {
  const { rows } = await write(sql`/* markModerationEmailSent */
    UPDATE user_moderation_email_sends
    SET sent_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId}
      AND send_key = ${sendKey}
      AND sent_at IS NULL
    RETURNING user_id
  `)
  return rows.length > 0
}

/** SES rejected the request before sending, so the same claimed job may retry. */
export async function resetRejectedModerationEmailSend(
  userId: string,
  sendKey: string,
): Promise<void> {
  await write(sql`/* resetRejectedModerationEmailSend */
    UPDATE user_moderation_email_sends SET sent_at = NULL
    WHERE user_id = ${userId} AND send_key = ${sendKey} AND sent_at IS NOT NULL`)
}

export async function releaseUnsentModerationEmailClaim(
  userId: string,
  sendKey: string,
): Promise<boolean> {
  const { rows } = await write(sql`/* releaseUnsentModerationEmailClaim */
    DELETE FROM user_moderation_email_sends
    WHERE user_id = ${userId}
      AND send_key = ${sendKey}
      AND sent_at IS NULL
    RETURNING user_id
  `)
  return rows.length > 0
}

export async function hasModerationEmailSent(userId: string, sendKey: string): Promise<boolean> {
  // A definitive SES throttle clears sent_at on the writer; a retry must see that reset.
  const { rows } = await write(sql`/* hasModerationEmailSent */
    SELECT 1
    FROM user_moderation_email_sends
    WHERE user_id = ${userId}
      AND send_key = ${sendKey}
      AND sent_at IS NOT NULL
    LIMIT 1
  `)
  return rows.length > 0
}
