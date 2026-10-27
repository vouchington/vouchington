import { getUsersWorkLimit } from '@services/users/work-limits'
import { getEngagementEmailsWorkLimit } from './work-limits.mts'
/* oxlint-disable max-lines -- Recipient selection and claim/admission lifecycle share their dispatcher. */
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
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
  buildFollowTopicsEmailVariables,
  buildReferralProgramEmailVariables,
  buildFollowNewsSourcesEmailVariables,
} from './email-variables.mts'
import pMap from 'p-map'

type EngagementRecipientRow = {
  id: string
  email_address: string
  username: string | null
  ui_locale: string | null
}

export async function dispatchEngagementEmails(userIds?: readonly string[]): Promise<void> {
  if (userIds?.length === 0) return
  const dispatchStartedAt = new Date()
  await dispatchFollowTopicsEmails(userIds)
  await dispatchReferralAndNewsSourceEmails(dispatchStartedAt, userIds)
}

async function dispatchReferralAndNewsSourceEmails(
  dispatchStartedAt: Date,
  userIds?: readonly string[],
): Promise<void> {
  await dispatchPostReferralLinkEmails(dispatchStartedAt, userIds)
  await dispatchFollowNewsSourcesEmails(dispatchStartedAt, userIds)
}

async function dispatchFollowTopicsEmails(userIds?: readonly string[]): Promise<void> {
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

type EngagementRecipientEmailType = 'follow_topics' | 'post_referral_link' | 'follow_news_sources'

function engagementEmailTypeLiteral(emailType: EngagementRecipientEmailType) {
  if (emailType === 'follow_topics') return sql`'follow_topics'`
  if (emailType === 'post_referral_link') return sql`'post_referral_link'`
  return sql`'follow_news_sources'`
}

async function readEngagementRecipients(
  label: string,
  emailType: EngagementRecipientEmailType,
  userIds: readonly string[] | undefined,
  eligibility: ReturnType<typeof sql>,
): Promise<EngagementRecipientRow[]> {
  const claimHours = getUsersWorkLimit('engagement_claim_hours')
  const pageSize = getEngagementEmailsWorkLimit('dispatch_batch_size')
  const query = sql`/* `.append(label).append(sql` */
    SELECT u.id, uea.email_address, u.username, u.ui_locale
    FROM users u
    JOIN user_email_addresses uea
      ON uea.user_id = u.id
      AND uea.is_primary = TRUE
    WHERE u.deleted_at IS NULL
      AND u.is_engagement_emails_enabled = TRUE
      AND u.processing_restricted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_suspensions us WHERE us.user_id = u.id AND us.lifted_at IS NULL
      )
      AND `)
  query.append(eligibility)
  query
    .append(
      sql`
      AND NOT EXISTS (
        SELECT 1
        FROM user_engagement_email_sends s
        WHERE s.user_id = u.id
          AND s.email_type = `,
    )
    .append(engagementEmailTypeLiteral(emailType))
    .append(
      sql`
          AND (
            s.sent_at IS NOT NULL
            OR s.delivery_attempted_at IS NOT NULL
            OR s.claimed_at >= CURRENT_TIMESTAMP - ${claimHours}::integer * INTERVAL '1 hour'
          )
      )
      AND (${userIds ?? null}::uuid[] IS NULL OR u.id = ANY(${userIds ?? null}::uuid[]))
    ORDER BY (
      SELECT s.claimed_at
      FROM user_engagement_email_sends s
      WHERE s.user_id = u.id AND s.email_type = `,
    )
    .append(engagementEmailTypeLiteral(emailType)).append(sql` ) ASC NULLS FIRST, u.id ASC
    LIMIT ${pageSize}`)
  const { rows } = await read(query)
  return rows as EngagementRecipientRow[]
}

async function getFollowTopicsRecipients(
  userIds?: readonly string[],
): Promise<EngagementRecipientRow[]> {
  return readEngagementRecipients(
    'getFollowTopicsRecipients',
    'follow_topics',
    userIds,
    sql`NOT EXISTS (
      SELECT 1
      FROM relation__user__follow__topic r
      WHERE r.subject_id = u.id
        AND r.deleted_at IS NULL
    )`,
  )
}

async function getPostReferralLinkRecipients(
  dispatchStartedAt: Date,
  userIds?: readonly string[],
): Promise<EngagementRecipientRow[]> {
  return readEngagementRecipients(
    'getPostReferralLinkRecipients',
    'post_referral_link',
    userIds,
    sql`NOT EXISTS (
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
    )`,
  )
}

async function getFollowNewsSourcesRecipients(
  dispatchStartedAt: Date,
  userIds?: readonly string[],
): Promise<EngagementRecipientRow[]> {
  return readEngagementRecipients(
    'getFollowNewsSourcesRecipients',
    'follow_news_sources',
    userIds,
    sql`NOT EXISTS (
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
    )`,
  )
}
