import onError from '@modules/on-error'
import { getRecommendedRssFeeds } from '@services/recommended-rss-feeds/get-recommendations'
import { getRecommendedTopics } from '@services/recommended-topics/get-recommendations'
import { getRssFeedsByIdBatch } from '@services/rss-feeds/get-batch'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import { getTrendingReferralPrograms } from '@services/trending-referral-programs/get-trending-referral-programs'
import {
  claimEngagementEmailSend,
  releaseUnsentEngagementEmailClaim,
} from '@services/users/engagement-emails'
import type { PrivateUser } from '@services/users/types'
import {
  enqueueSendFollowNewsSourcesEmail,
  enqueueSendFollowTopicsEmail,
  enqueueSendPostReferralLinkEmail,
} from '@queues/email-digests/enqueues'
import {
  buildFollowNewsSourcesEmailVariables,
  buildFollowTopicsEmailVariables,
  buildReferralProgramEmailVariables,
} from './email-variables.mts'
import pMap from 'p-map'
import {
  getFollowNewsSourcesRecipients,
  getFollowTopicsRecipients,
  getPostReferralLinkRecipients,
  type EngagementRecipientRow,
} from './engagement-email-recipients.mts'

export async function dispatchReferralAndNewsSourceEmails(
  dispatchStartedAt: Date,
  userIds?: readonly string[],
): Promise<void> {
  await dispatchPostReferralLinkEmails(dispatchStartedAt, userIds)
  await dispatchFollowNewsSourcesEmails(dispatchStartedAt, userIds)
}

export async function dispatchFollowTopicsEmails(userIds?: readonly string[]): Promise<void> {
  const recipients = await getFollowTopicsRecipients(userIds)
  await pMap(recipients, dispatchFollowTopicsEmail, { concurrency: 1, stopOnError: false })
}

async function dispatchFollowTopicsEmail(recipient: EngagementRecipientRow): Promise<void> {
  let claimed = false
  try {
    if (!(await claimEngagementEmailSend(recipient.id, 'follow_topics'))) return
    claimed = true

    const currentUser = { id: recipient.id } as PrivateUser
    const recommendations = await getRecommendedTopics(currentUser, { limit: 5 })
    if (recommendations.results.length === 0) return

    const topics = await getTopicsByAnyBatch(recommendations.results.map(result => result.id))
    const props = buildFollowTopicsEmailVariables(recipient, recommendations.results, topics)
    if (!props) return

    await enqueueSendFollowTopicsEmail(
      {
        userId: recipient.id,
        uiLocale: recipient.ui_locale ?? null,
      },
      props,
    )
  } catch (err) {
    /* c8 ignore start -- Defensive cleanup/observability for per-recipient recommendation or enqueue failures. */
    if (claimed) await releaseEngagementClaim(recipient.id, 'follow_topics')
    reportEngagementDispatchError(err, 'follow_topics', recipient.id)
    /* c8 ignore stop */
  }
}

async function dispatchPostReferralLinkEmails(
  dispatchStartedAt: Date,
  userIds?: readonly string[],
): Promise<void> {
  const recipients = await getPostReferralLinkRecipients(dispatchStartedAt, userIds)
  if (recipients.length === 0) return

  const programs = await getTrendingReferralPrograms({ limit: 5 })
  if (programs.referral_programs.length === 0) return

  const topics = await getTopicsByAnyBatch(programs.referral_programs.map(program => program.id))
  await pMap(
    recipients,
    recipient => dispatchPostReferralLinkEmail(recipient, programs.referral_programs, topics),
    { concurrency: 1, stopOnError: false },
  )
}

async function dispatchPostReferralLinkEmail(
  recipient: EngagementRecipientRow,
  programs: Awaited<ReturnType<typeof getTrendingReferralPrograms>>['referral_programs'],
  topics: Awaited<ReturnType<typeof getTopicsByAnyBatch>>,
): Promise<void> {
  let claimed = false
  try {
    const props = buildReferralProgramEmailVariables(recipient, programs, topics)
    if (!props) return
    if (!(await claimEngagementEmailSend(recipient.id, 'post_referral_link'))) return
    claimed = true

    await enqueueSendPostReferralLinkEmail(
      {
        userId: recipient.id,
        uiLocale: recipient.ui_locale ?? null,
      },
      props,
    )
  } catch (err) {
    /* c8 ignore start -- Defensive cleanup/observability for per-recipient enqueue failures. */
    if (claimed) await releaseEngagementClaim(recipient.id, 'post_referral_link')
    reportEngagementDispatchError(err, 'post_referral_link', recipient.id)
    /* c8 ignore stop */
  }
}

async function dispatchFollowNewsSourcesEmails(
  dispatchStartedAt: Date,
  userIds?: readonly string[],
): Promise<void> {
  const recipients = await getFollowNewsSourcesRecipients(dispatchStartedAt, userIds)
  await pMap(recipients, dispatchFollowNewsSourcesEmail, {
    concurrency: 1,
    stopOnError: false,
  })
}

async function dispatchFollowNewsSourcesEmail(recipient: EngagementRecipientRow): Promise<void> {
  let claimed = false
  try {
    if (!(await claimEngagementEmailSend(recipient.id, 'follow_news_sources'))) return
    claimed = true

    const recommendations = await getRecommendedRssFeeds(recipient.id, {
      limit: 5,
      source: 'all',
    })
    if (recommendations.results.length === 0) return

    const feeds = await getRssFeedsByIdBatch(recommendations.results.map(result => result.id))
    const props = buildFollowNewsSourcesEmailVariables(recipient, feeds)
    if (!props) return

    await enqueueSendFollowNewsSourcesEmail(
      {
        userId: recipient.id,
        uiLocale: recipient.ui_locale ?? null,
      },
      props,
    )
  } catch (err) {
    /* c8 ignore start -- Defensive cleanup/observability for per-recipient enqueue failures. */
    if (claimed) await releaseEngagementClaim(recipient.id, 'follow_news_sources')
    reportEngagementDispatchError(err, 'follow_news_sources', recipient.id)
    /* c8 ignore stop */
  }
}

/* c8 ignore start -- Only called from defensive dispatch cleanup paths. */
async function releaseEngagementClaim(
  userId: string,
  emailType: 'follow_topics' | 'post_referral_link' | 'follow_news_sources',
): Promise<void> {
  try {
    await releaseUnsentEngagementEmailClaim(userId, emailType)
  } catch (err) {
    /* c8 ignore next 2 -- Defensive observability for rare cleanup failures after enqueue errors. */
    reportEngagementDispatchError(err, emailType, userId)
  }
}

function reportEngagementDispatchError(error: unknown, emailType: string, userId: string): void {
  const reportableError = error instanceof Error ? error : new Error(String(error))
  Object.assign(reportableError, {
    tags: { worker: 'engagement-email-dispatch', emailType },
    extra: { userId },
  })
  onError(reportableError)
}
/* c8 ignore stop */
