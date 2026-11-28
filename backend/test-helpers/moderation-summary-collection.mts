import {
  createModerationSummaryCollection,
  type ModerationSummaryNext,
} from '../queues/background/enqueues/moderation-summary-state.mts'
import { processSendCommunityModerationSummaryEmail } from '../workers/email-digests/processors/community-moderation-summary.mts'
import { getModerationActivityWindowStart } from '../services/communities/moderation-summary-schedule.mts'
import { getModerationEmailCadence } from '../services/communities/moderation-summary-emails.mts'
import { runModerationSummaryStage } from '../services/communities/moderation-summary-stages.mts'
import type { CommunityModerationSummaryEmailProps } from '../../email-templates/types.mts'

/** Drives the real bounded collector for a fresh fixture user's finite digest. */
export async function collectTestModerationSummaryState(
  userId: string,
  start: Date,
  end: Date,
  eligibilityAt: Date,
  limits?: { membershipPageSize: number; sourcePageSize: number },
) {
  let collection = createModerationSummaryCollection()
  let communities: CommunityModerationSummaryEmailProps['communities'] = []
  let stage: ModerationSummaryNext = 'memberships'
  for (let step = 0; step < 1000; step++) {
    if (stage === 'send') return { collection, communities }
    const result = await runModerationSummaryStage(stage, {
      userId,
      windowStart: start,
      windowEnd: end,
      eligibilityAt,
      collection,
      communities,
      limits,
    })
    ;({ collection, communities, next: stage } = result)
  }
  throw new Error('Fixture digest exceeded its bounded test traversal')
}

export { createModerationSummaryCollection }

export async function collectTestModerationSummary(
  userId: string,
  start: Date,
  end: Date,
  eligibilityAt: Date,
  limits?: { membershipPageSize: number; sourcePageSize: number },
) {
  return (await collectTestModerationSummaryState(userId, start, end, eligibilityAt, limits))
    .communities
}

/** Existing delivery-boundary regressions use a fully collected real fixture digest. */
export async function processTestModerationSummaryEmail(
  input: Parameters<typeof processSendCommunityModerationSummaryEmail>[0],
  variables: Parameters<typeof processSendCommunityModerationSummaryEmail>[1],
): Promise<unknown> {
  if (!input.userId) return processSendCommunityModerationSummaryEmail(input, variables)
  const queuedEnd = input.windowEnd ? new Date(input.windowEnd) : new Date()
  const end = new Date(Math.min(queuedEnd.getTime(), Date.now()))
  const start = input.windowStart
    ? new Date(input.windowStart)
    : getModerationActivityWindowStart(await getModerationEmailCadence(input.userId), end)
  const collected = await collectTestModerationSummaryState(input.userId, start, end, queuedEnd)
  return processSendCommunityModerationSummaryEmail(input, { ...variables, ...collected })
}

export function moderationSummaryVariableDefaults() {
  return {
    unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
    physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
    remainingCommunityCount: 0,
    collection: createModerationSummaryCollection(),
  }
}

export function createTestNotificationEmailFooter() {
  return {
    settingsUrl: 'https://voucha.ai/my/notification-settings',
    unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
    physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
  }
}

export function createTestModerationEmailFooter() {
  return {
    ...createTestNotificationEmailFooter(),
    dispatchTimeZone: 'America/Los_Angeles',
  }
}
