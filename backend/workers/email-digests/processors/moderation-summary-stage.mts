import type { ModerationSummaryStage } from '@queues/background/enqueues/moderation-summary-state'
import type { ProcessSendCommunityModerationSummaryEmailVariables } from '@queues/background/enqueues/email-digests-domain'
import type { EmailTemplateInput } from '@queues/emails/types'
import { enqueueModerationSummaryStep } from '@queues/email-digests/enqueues'
import { runModerationSummaryStage } from '@services/communities/moderation-summary-stages'
import {
  readModerationSummaryWindow,
  resolveModerationSummaryRecipient,
} from './moderation-summary-guard.mts'

/**
 * Runs one collection stage for one recipient, then admits the job that follows it. Each stage is
 * its own job with bounded retry attempts, so a failure retries only that stage from its own cursor
 * in the job data.
 */
export async function processModerationSummaryStage(
  stage: ModerationSummaryStage,
  input: EmailTemplateInput & { userId: string; trackingKey: string },
  variables: ProcessSendCommunityModerationSummaryEmailVariables,
): Promise<unknown> {
  const recipient = await resolveModerationSummaryRecipient(input)
  if ('skipped' in recipient) return recipient.skipped
  const window = await readModerationSummaryWindow(
    input.userId,
    input,
    variables.dispatchTimeZone,
    new Date(),
  )
  if (!window) return null
  const result = await runModerationSummaryStage(stage, {
    userId: input.userId,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    eligibilityAt: window.queuedWindowEnd,
    collection: variables.collection,
    communities: variables.communities,
  })
  await enqueueModerationSummaryStep(
    result.next,
    {
      userId: input.userId,
      trackingKey: input.trackingKey,
      windowStart: window.windowStart.toISOString(),
      windowEnd: window.queuedWindowEnd.toISOString(),
      uiLocale: input.uiLocale,
    },
    { ...variables, collection: result.collection, communities: result.communities },
  )
  return { continued: true }
}
