import { strictEqual } from 'node:assert'
import { onTestFinished, vi } from 'vitest'
import * as ses from '../modules/aws/ses.mts'
import {
  onEnqueueAdmission,
  type EnqueueAdmission,
} from '../data-stores/valkey-glide-mq/glide-mq-admission.mts'
import { BACKGROUND_QUEUE_NAME } from '../queues/background/config.mts'
import {
  EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB,
  EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB,
  EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB,
} from '../queues/background/enqueues/email-digests-jobs.mts'
import { background } from '../queues/background/queues.mts'
import { dispatchEngagementEmails } from '../services/engagement-emails/dispatch-engagement-emails.mts'
import {
  claimEngagementEmailSend,
  hasEngagementEmailSent,
} from '../services/users/engagement-emails.mts'
import { readEnqueuedJob } from './queue-jobs.mts'

export const scopedEngagementClaimResult = {
  ownedSent: false,
  ownedClaimAfterDispatch: false,
  foreignClaimBeforeDispatch: true,
  foreignClaimAfterDispatch: false,
}

type EmailType = 'follow_topics' | 'post_referral_link' | 'follow_news_sources'
const jobNames = new Set([
  EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB.name,
  EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB.name,
  EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB.name,
])
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown }

/** Claims retain their original dispatcher contract; the fixture owns admission observation. */
export async function ownedEngagementDispatch(
  userId: string,
  foreignUserId: string,
  emailType: EmailType,
) {
  const observed = await withOwnedEngagementAdmissions([userId, foreignUserId], async () => {
    strictEqual(await dispatchEngagementEmails([userId]), undefined)
    const ownedSent = await hasEngagementEmailSent(userId, emailType)
    const ownedClaimAfterDispatch = await claimEngagementEmailSend(userId, emailType)
    const foreignClaimBeforeDispatch = await claimEngagementEmailSend(foreignUserId, emailType)
    strictEqual(await dispatchEngagementEmails([foreignUserId]), undefined)
    return {
      ownedSent,
      ownedClaimAfterDispatch,
      foreignClaimBeforeDispatch,
      foreignClaimAfterDispatch: await claimEngagementEmailSend(foreignUserId, emailType),
    }
  })
  const targetJobName = {
    follow_topics: EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB.name,
    post_referral_link: EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB.name,
    follow_news_sources: EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB.name,
  }[emailType]
  // Dispatch evaluates every kind for both owned recipients; preserve and drain them all.
  const targetJobs = observed.jobs.filter(job => job.name === targetJobName)
  return { claims: observed.value, jobs: observed.jobs, targetJobs }
}

/** One observer/SES owner; joins real admissions and reports each failed outcome once. */
export async function withOwnedEngagementAdmissions<T>(
  userIds: readonly string[],
  run: () => Promise<T>,
) {
  const receipts: Array<{ event: EnqueueAdmission; outcome: Promise<Outcome<unknown>> }> = []
  let detach = () => {}
  let deliveryGuard: { restore: () => void; attempted: () => boolean } | undefined
  let finish: ReturnType<typeof settle> | undefined
  const action = Promise.withResolvers<Outcome<T>>()
  let reported = false
  let bodyOwnsReport = false
  const drain = () => (finish ??= settle())
  const report = (outcome: Awaited<ReturnType<typeof settle>>) => {
    if (outcome.ok || reported) return
    reported = true
    throw outcome.error
  }
  onTestFinished(async () => {
    const outcome = await drain()
    if (!bodyOwnsReport) report(outcome)
  })
  try {
    detach = onEnqueueAdmission(event => {
      if (
        event.queue !== background ||
        event.queueName !== BACKGROUND_QUEUE_NAME ||
        !jobNames.has(event.jobName) ||
        !event.inputs.some(input => ownsRecipient(input, userIds))
      )
        return undefined
      receipts.push({
        event,
        outcome: event.completion.then(
          value => ({ ok: true, value }),
          (err: unknown) => ({ ok: false, error: err }),
        ),
      })
      return undefined
    })
    const sendEmail = vi.spyOn(ses, 'sendEmail')
    deliveryGuard = {
      restore: () => {
        sendEmail.mockRestore()
      },
      attempted: () => sendEmail.mock.calls.length > 0,
    }
    sendEmail.mockRejectedValue(new Error('Live email delivery is forbidden in admission tests'))
    action.resolve({ ok: true, value: await run() })
  } catch (err) {
    action.resolve({ ok: false, error: err })
  }
  bodyOwnsReport = true
  const outcome = await drain()
  if (!outcome.ok) {
    reported = true
    throw outcome.error
  }
  return outcome.value

  async function settle() {
    const outcome = await action.promise
    const errors: unknown[] = []
    const jobs: Array<{ name: string; data: unknown }> = []
    try {
      // The ledger may grow while an original admission is pending.
      for (const receipt of receipts) {
        const admission = await receipt.outcome
        errors.push(...receipt.event.observerErrors, ...receipt.event.reportingErrors)
        if (!admission.ok) {
          errors.push(admission.error)
          continue
        }
        try {
          const job = await readEnqueuedJob(background, admission.value)
          jobs.push({ name: job.name, data: job.data })
        } catch (err) {
          errors.push(err)
        }
      }
    } finally {
      try {
        detach()
      } catch (err) {
        errors.push(err)
      }
      if (deliveryGuard?.attempted()) errors.push(new Error('Unexpected email delivery attempt'))
      try {
        deliveryGuard?.restore()
      } catch (err) {
        errors.push(err)
      }
    }
    if (errors.length)
      return {
        ok: false as const,
        error: new AggregateError(errors, 'Owned engagement admission failed', {
          cause: outcome.ok ? errors[0] : outcome.error,
        }),
      }
    if (!outcome.ok) return outcome
    return { ok: true as const, value: { value: outcome.value, jobs } }
  }
}

function ownsRecipient(input: unknown, userIds: readonly string[]): boolean {
  if (typeof input !== 'object' || input === null || !('input' in input)) return false
  const recipient = input.input
  return (
    typeof recipient === 'object' &&
    recipient !== null &&
    'userId' in recipient &&
    typeof recipient.userId === 'string' &&
    userIds.includes(recipient.userId)
  )
}
