import { createHash } from 'node:crypto'
import onError from '@modules/on-error'
import { releaseUnsentEngagementEmailClaim } from '@services/users/engagement-emails'
import type { EngagementEmailType } from './recipient-page.mts'

export function sendJobId(
  ownerJobId: string | undefined,
  type: EngagementEmailType,
  userId: string,
) {
  return ownerJobId
    ? `email_digests_engagement__${createHash('sha256').update(`${ownerJobId}:${type}:${userId}`).digest('hex')}`
    : undefined
}

/* c8 ignore start -- Only called from defensive dispatch cleanup paths. */
export async function releaseEngagementClaim(
  userId: string,
  emailType: 'follow_topics' | 'post_referral_link' | 'follow_news_sources',
  ownerJobId?: string,
): Promise<void> {
  try {
    await releaseUnsentEngagementEmailClaim(userId, emailType, ownerJobId)
  } catch (err) {
    /* c8 ignore next 2 -- Defensive observability for rare cleanup failures after enqueue errors. */
    reportEngagementDispatchError(err, emailType, userId)
  }
}

export function reportEngagementDispatchError(
  error: unknown,
  emailType: string,
  userId: string,
): void {
  const reportableError = error instanceof Error ? error : new Error(String(error))
  Object.assign(reportableError, {
    tags: { worker: 'engagement-email-dispatch', emailType },
    extra: { userId },
  })
  onError(reportableError)
}
/* c8 ignore stop */
