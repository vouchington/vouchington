/* oxlint-disable max-lines -- Engagement email query and formatting helpers are kept with their dispatcher. */
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMarketingPostalAddress, getSiteUrl } from '@modules/utils'
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
} from '@queues/emails/enqueues'
import type {
  FollowNewsSourcesEmailProps,
  FollowTopicsEmailProps,
  PostReferralLinkEmailProps,
} from '@email-templates/core'
import pMap from 'p-map'

type EngagementRecipientRow = {
  id: string
  email_address: string
  username: string | null
  ui_locale: string | null
}

type TopicRecommendationInput = {
  id: string
  reason?: string | null
}

type TopicInput = {
  name: string
  slug: string
}

type ReferralProgramInput = {
  id: string
  link_count: number
}

type RssFeedInput = {
  id: string
  title: string
  home_page_url?: { url: string } | null
  rss_feed_url: { url: string }
  topic: {
    slug?: string | null
    markdown?: string | null
  }
}

export async function dispatchEngagementEmails(): Promise<void> {
  const dispatchStartedAt = new Date()
  await dispatchFollowTopicsEmails()
  await dispatchReferralAndNewsSourceEmails(dispatchStartedAt)
}

async function dispatchReferralAndNewsSourceEmails(dispatchStartedAt: Date): Promise<void> {
  await dispatchPostReferralLinkEmails(dispatchStartedAt)
  await dispatchFollowNewsSourcesEmails(dispatchStartedAt)
}

async function dispatchFollowTopicsEmails(): Promise<void> {
  const recipients = await getFollowTopicsRecipients()
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
    const items = buildFollowTopicsItems(recommendations.results, topics)

    if (items.length === 0) return

    const props: FollowTopicsEmailProps = {
      userName: recipient.username ?? undefined,
      topics: items,
      settingsUrl: getSiteUrl('/my/topics/following'),
      unsubscribeUrl: getSiteUrl('/my/notification-settings'),
      physicalAddress: getMarketingPostalAddress(),
    }
    await enqueueSendFollowTopicsEmail(
      {
        userId: recipient.id,
        uiLocale: recipient.ui_locale ?? null,
      },
      props,
    )
  } catch (error) {
    /* c8 ignore start -- Defensive cleanup/observability for per-recipient recommendation or enqueue failures. */
    if (claimed) await releaseEngagementClaim(recipient.id, 'follow_topics')
    reportEngagementDispatchError(error, 'follow_topics', recipient.id)
    /* c8 ignore stop */
  }
}

async function dispatchPostReferralLinkEmails(dispatchStartedAt: Date): Promise<void> {
  const recipients = await getPostReferralLinkRecipients(dispatchStartedAt)
  if (recipients.length === 0) return

  const programs = await getTrendingReferralPrograms({ limit: 5 })
  if (programs.referral_programs.length === 0) return

  const topics = await getTopicsByAnyBatch(programs.referral_programs.map(program => program.id))
  const referralPrograms = buildReferralProgramItems(programs.referral_programs, topics)

  if (referralPrograms.length === 0) return

  await pMap(recipients, recipient => dispatchPostReferralLinkEmail(recipient, referralPrograms), {
    concurrency: 1,
    stopOnError: false,
  })
}

async function dispatchPostReferralLinkEmail(
  recipient: EngagementRecipientRow,
  referralPrograms: PostReferralLinkEmailProps['referralPrograms'],
): Promise<void> {
  let claimed = false
  try {
    if (!(await claimEngagementEmailSend(recipient.id, 'post_referral_link'))) return
    claimed = true

    const props: PostReferralLinkEmailProps = {
      userName: recipient.username ?? undefined,
      referralPrograms,
      settingsUrl: getSiteUrl('/my/referral-links'),
      unsubscribeUrl: getSiteUrl('/my/notification-settings'),
      physicalAddress: getMarketingPostalAddress(),
    }
    await enqueueSendPostReferralLinkEmail(
      {
        userId: recipient.id,
        uiLocale: recipient.ui_locale ?? null,
      },
      props,
    )
  } catch (error) {
    /* c8 ignore start -- Defensive cleanup/observability for per-recipient enqueue failures. */
    if (claimed) await releaseEngagementClaim(recipient.id, 'post_referral_link')
    reportEngagementDispatchError(error, 'post_referral_link', recipient.id)
    /* c8 ignore stop */
  }
}

async function dispatchFollowNewsSourcesEmails(dispatchStartedAt: Date): Promise<void> {
  const recipients = await getFollowNewsSourcesRecipients(dispatchStartedAt)
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
    const sources = buildFollowNewsSourceItems(feeds)

    if (sources.length === 0) return

    const props: FollowNewsSourcesEmailProps = {
      userName: recipient.username ?? undefined,
      sources,
      settingsUrl: getSiteUrl('/my/news-sources'),
      unsubscribeUrl: getSiteUrl('/my/notification-settings'),
      physicalAddress: getMarketingPostalAddress(),
    }
    await enqueueSendFollowNewsSourcesEmail(
      {
        userId: recipient.id,
        uiLocale: recipient.ui_locale ?? null,
      },
      props,
    )
  } catch (error) {
    /* c8 ignore start -- Defensive cleanup/observability for per-recipient enqueue failures. */
    if (claimed) await releaseEngagementClaim(recipient.id, 'follow_news_sources')
    reportEngagementDispatchError(error, 'follow_news_sources', recipient.id)
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
  } catch (error) {
    /* c8 ignore next 2 -- Defensive observability for rare cleanup failures after enqueue errors. */
    reportEngagementDispatchError(error, emailType, userId)
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

export function buildFollowTopicsItems(
  recommendations: TopicRecommendationInput[],
  topics: Array<TopicInput | null | undefined>,
): FollowTopicsEmailProps['topics'] {
  return recommendations
    .map((result, index) => {
      const topic = topics[index]
      if (!topic) return null
      return {
        name: topic.name,
        url: getSiteUrl(`/topic/${topic.slug}`),
        reason: result.reason ?? undefined,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}

export function buildReferralProgramItems(
  programs: ReferralProgramInput[],
  topics: Array<TopicInput | null | undefined>,
): PostReferralLinkEmailProps['referralPrograms'] {
  return programs
    .map((program, index) => {
      const topic = topics[index]
      if (!topic) return null
      return {
        name: topic.name,
        url: getSiteUrl(`/referral-program/${topic.slug}`),
        linkCount: program.link_count,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}

export function buildFollowNewsSourceItems(
  feeds: Array<RssFeedInput | null | undefined>,
): FollowNewsSourcesEmailProps['sources'] {
  return feeds
    .map(feed => {
      if (!feed) return null
      return {
        name: feed.title,
        url: getSiteUrl(`/source/${feed.topic.slug ?? feed.id}`),
        description: feed.topic.markdown || undefined,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}

async function getFollowTopicsRecipients(): Promise<EngagementRecipientRow[]> {
  const { rows } = await read(sql`/* getFollowTopicsRecipients */
    SELECT u.id, uea.email_address, u.username, u.ui_locale
    FROM users u
    JOIN user_email_addresses uea
      ON uea.user_id = u.id
      AND uea.is_primary = TRUE
    WHERE u.deleted_at IS NULL
      AND u.engagement_emails_enabled = TRUE
      AND u.processing_restricted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions us WHERE us.user_id = u.id AND us.lifted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM relation__user__follow__topic r
        WHERE r.subject_id = u.id
          AND r.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_engagement_email_sends s
        WHERE s.user_id = u.id
          AND s.email_type = 'follow_topics'
          AND (
            s.sent_at IS NOT NULL
            OR s.delivery_attempted_at IS NOT NULL
            OR s.claimed_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'
          )
      )
    ORDER BY (
      SELECT s.claimed_at
      FROM user_engagement_email_sends s
      WHERE s.user_id = u.id AND s.email_type = 'follow_topics'
    ) ASC NULLS FIRST, u.id ASC
    LIMIT 250
  `)
  return rows as EngagementRecipientRow[]
}

async function getPostReferralLinkRecipients(
  dispatchStartedAt: Date,
): Promise<EngagementRecipientRow[]> {
  const { rows } = await read(sql`/* getPostReferralLinkRecipients */
    SELECT u.id, uea.email_address, u.username, u.ui_locale
    FROM users u
    JOIN user_email_addresses uea
      ON uea.user_id = u.id
      AND uea.is_primary = TRUE
    WHERE u.deleted_at IS NULL
      AND u.engagement_emails_enabled = TRUE
      AND u.processing_restricted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions us WHERE us.user_id = u.id AND us.lifted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_referral_program_links urpl
        WHERE urpl.user_id = u.id
          AND urpl.deleted_at IS NULL
          AND urpl.activated_at IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_engagement_email_sends s
        WHERE s.user_id = u.id
          AND s.email_type = 'follow_topics'
          AND s.claimed_at >= ${dispatchStartedAt}
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_engagement_email_sends s
        WHERE s.user_id = u.id
          AND s.email_type = 'post_referral_link'
          AND (
            s.sent_at IS NOT NULL
            OR s.delivery_attempted_at IS NOT NULL
            OR s.claimed_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'
          )
      )
    ORDER BY (
      SELECT s.claimed_at
      FROM user_engagement_email_sends s
      WHERE s.user_id = u.id AND s.email_type = 'post_referral_link'
    ) ASC NULLS FIRST, u.id ASC
    LIMIT 250
  `)
  return rows as EngagementRecipientRow[]
}

async function getFollowNewsSourcesRecipients(
  dispatchStartedAt: Date,
): Promise<EngagementRecipientRow[]> {
  const { rows } = await read(sql`/* getFollowNewsSourcesRecipients */
    SELECT u.id, uea.email_address, u.username, u.ui_locale
    FROM users u
    JOIN user_email_addresses uea
      ON uea.user_id = u.id
      AND uea.is_primary = TRUE
    WHERE u.deleted_at IS NULL
      AND u.engagement_emails_enabled = TRUE
      AND u.processing_restricted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions us WHERE us.user_id = u.id AND us.lifted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM relation__user__follow__rss_feed r
        WHERE r.subject_id = u.id
          AND r.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_engagement_email_sends s
        WHERE s.user_id = u.id
          AND s.email_type IN ('follow_topics', 'post_referral_link')
          AND s.claimed_at >= ${dispatchStartedAt}
      )
      AND NOT EXISTS (
        SELECT 1
        FROM user_engagement_email_sends s
        WHERE s.user_id = u.id
          AND s.email_type = 'follow_news_sources'
          AND (
            s.sent_at IS NOT NULL
            OR s.delivery_attempted_at IS NOT NULL
            OR s.claimed_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'
          )
      )
    ORDER BY (
      SELECT s.claimed_at
      FROM user_engagement_email_sends s
      WHERE s.user_id = u.id AND s.email_type = 'follow_news_sources'
    ) ASC NULLS FIRST, u.id ASC
    LIMIT 250
  `)
  return rows as EngagementRecipientRow[]
}
