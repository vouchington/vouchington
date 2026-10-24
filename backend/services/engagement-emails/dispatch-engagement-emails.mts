import pMap from 'p-map'
import { getEngagementEmailsWorkLimit } from './work-limits.mts'
import {
  readEngagementRecipientPage,
  readPreparedEngagementRecipients,
  type EngagementEmailType,
  type EngagementRecipient as EngagementRecipientRow,
  type EngagementRecipientCursor,
  type PreparedEngagementRecipientPage,
} from './recipient-page.mts'
import { dispatchFollowTopicsEmail } from './dispatch-follow-topics.mts'
import { dispatchPostReferralLinkRecipients } from './dispatch-post-referral.mts'
import { dispatchFollowNewsSourcesEmail } from './dispatch-follow-news.mts'

export async function dispatchEngagementEmails(userIds?: readonly string[]): Promise<void> {
  if (userIds?.length === 0) return
  const dispatchStartedAt = new Date()
  for (const type of ['follow_topics', 'post_referral_link', 'follow_news_sources'] as const) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Later email phases must observe prior-phase claims.
    await dispatchEngagementRecipientPage({ type, dispatchStartedAt, userIds }) // no-mistakes-disable-line query-reached-per-item: three fixed phases each read one capped raw page and must observe the prior phase's committed claims.
  }
}

export async function dispatchEngagementRecipientPage(input: {
  type: EngagementEmailType
  dispatchStartedAt: Date
  userIds?: readonly string[]
  cursor?: EngagementRecipientCursor
  rawLimit?: number
  remainingBudget?: number
  ownerJobId?: string
  preparedPage?: PreparedEngagementRecipientPage
}): Promise<{ count: number; scannedCount: number; nextCursor?: EngagementRecipientCursor }> {
  const page = input.preparedPage ?? (await prepareEngagementRecipientPage(input))
  const recipients = await readPreparedEngagementRecipients({
    type: input.type,
    dispatchStartedAt: input.dispatchStartedAt,
    recipientIds: page.recipientIds,
  })
  if (input.type === 'follow_topics')
    await pMap(recipients, recipient => dispatchFollowTopicsEmail(recipient, input.ownerJobId), {
      concurrency: 1,
      stopOnError: false,
    })
  else if (input.type === 'post_referral_link')
    await dispatchPostReferralLinkRecipients(recipients, input.ownerJobId)
  else
    await pMap(
      recipients,
      recipient => dispatchFollowNewsSourcesEmail(recipient, input.ownerJobId),
      {
        concurrency: 1,
        stopOnError: false,
      },
    )
  return {
    // A replay may find an already-sent recipient absent from the live projection. The
    // original selected page still consumed this sweep's admission budget.
    count: page.recipientIds.length,
    scannedCount: page.scannedCount,
    ...(page.nextCursor && { nextCursor: page.nextCursor }),
  }
}

export async function prepareEngagementRecipientPage(input: {
  type: EngagementEmailType
  dispatchStartedAt: Date
  userIds?: readonly string[]
  cursor?: EngagementRecipientCursor
  rawLimit?: number
  remainingBudget?: number
}): Promise<PreparedEngagementRecipientPage> {
  const page = await readEngagementRecipientPage({
    ...input,
    eligibleLimit: input.remainingBudget ?? getEngagementEmailsWorkLimit('dispatch_batch_size'),
  })
  return {
    recipientIds: page.recipients.map(recipient => recipient.id),
    scannedCount: page.scannedCount,
    ...(page.nextCursor && { nextCursor: page.nextCursor }),
  }
}

export async function getFollowTopicsRecipients(
  userIds?: readonly string[],
  asOf?: Date,
): Promise<EngagementRecipientRow[]> {
  return readDirectRecipients('follow_topics', new Date(), userIds, asOf)
}

export async function getPostReferralLinkRecipients(
  dispatchStartedAt: Date,
  userIds?: readonly string[],
  asOf?: Date,
): Promise<EngagementRecipientRow[]> {
  return readDirectRecipients('post_referral_link', dispatchStartedAt, userIds, asOf)
}

export async function getFollowNewsSourcesRecipients(
  dispatchStartedAt: Date,
  userIds?: readonly string[],
  asOf?: Date,
): Promise<EngagementRecipientRow[]> {
  return readDirectRecipients('follow_news_sources', dispatchStartedAt, userIds, asOf)
}

async function readDirectRecipients(
  type: EngagementEmailType,
  dispatchStartedAt: Date,
  userIds?: readonly string[],
  asOf?: Date,
): Promise<EngagementRecipientRow[]> {
  const page = await readEngagementRecipientPage({
    type,
    dispatchStartedAt,
    userIds,
    asOf,
  })
  if (page.nextCursor?.lane !== 'claimed') return page.recipients
  const remaining = getEngagementEmailsWorkLimit('dispatch_batch_size') - page.recipients.length
  if (remaining === 0) return page.recipients
  const due = await readEngagementRecipientPage({
    type,
    dispatchStartedAt,
    userIds,
    asOf,
    cursor: page.nextCursor,
    eligibleLimit: remaining,
  })
  return [...page.recipients, ...due.recipients]
}
