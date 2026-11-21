import type { EmailTemplateInput } from '@queues/emails/types'
import { resolveEmailRecipient } from '@workers/emails/processors/recipient'
import {
  getModerationEmailCadence,
  hasModerationEmailSent,
  isModerationEmailsEnabled,
  releaseUnsentModerationEmailClaim,
} from '@services/communities/moderation-summary-emails'
import { getModerationActivityWindowStart } from '@services/communities/moderation-summary-schedule'
import { isModerationSummaryJobCurrent } from '@services/communities/moderation-summary-retention'

export type ModerationSummaryWindow = {
  windowStart: Date
  windowEnd: Date
  queuedWindowEnd: Date
}

/** Resolves the recipient, or releases the unsent claim and reports why the job ends. */
export async function resolveModerationSummaryRecipient(
  input: EmailTemplateInput,
): Promise<{ skipped: unknown } | { emailAddress: string }> {
  const recipient = await resolveEmailRecipient(input)
  if (recipient.status !== 'skipped') return { emailAddress: recipient.emailAddress }
  if (input.trackingKey)
    await releaseUnsentModerationEmailClaim(recipient.userId, input.trackingKey)
  return { skipped: recipient }
}

/**
 * The window a recipient's job covers, or null when the job is stale: emails are off, the window
 * rolled over, or this summary was already sent. Every stage and the send re-check it, so a stale
 * chain ends at its next job.
 */
export async function readModerationSummaryWindow(
  userId: string,
  input: EmailTemplateInput,
  dispatchTimeZone: string,
  now: Date,
): Promise<ModerationSummaryWindow | null> {
  if (!(await isModerationEmailsEnabled(userId))) return null
  if (
    input.trackingKey &&
    (!input.windowEnd ||
      !isModerationSummaryJobCurrent(input.trackingKey, input.windowEnd, dispatchTimeZone, now))
  )
    return null
  if (input.trackingKey && (await hasModerationEmailSent(userId, input.trackingKey))) return null
  const queuedWindowEnd = input.windowEnd ? new Date(input.windowEnd) : now
  const windowEnd = new Date(Math.min(queuedWindowEnd.getTime(), now.getTime()))
  const windowStart = input.windowStart
    ? new Date(input.windowStart)
    : getModerationActivityWindowStart(await getModerationEmailCadence(userId), windowEnd)
  return { windowStart, windowEnd, queuedWindowEnd }
}
