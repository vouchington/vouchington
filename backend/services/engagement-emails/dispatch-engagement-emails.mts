import {
  dispatchFollowTopicsEmails,
  dispatchReferralAndNewsSourceEmails,
} from './dispatch-engagement-email-kinds.mts'

export async function dispatchEngagementEmails(userIds?: readonly string[]): Promise<void> {
  if (userIds?.length === 0) return
  const dispatchStartedAt = new Date()
  await dispatchFollowTopicsEmails(userIds)
  await dispatchReferralAndNewsSourceEmails(dispatchStartedAt, userIds)
}
