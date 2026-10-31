import {
  getFollowNewsSourcesRecipients,
  getFollowTopicsRecipients,
  getPostReferralLinkRecipients,
} from '@services/engagement-emails/dispatch-engagement-emails'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runEngagementEmailRecipientScenarios(): Promise<void> {
  const startedAt = new Date()
  const scenarios = [
    ['engagement-follow-topics', () => getFollowTopicsRecipients()],
    ['engagement-post-referral-link', () => getPostReferralLinkRecipients(startedAt)],
    ['engagement-follow-news-sources', () => getFollowNewsSourcesRecipients(startedAt)],
  ] as const
  for (const [id, run] of scenarios) {
    registerScenarioContract(id, {
      // Fairness ranks all eligible users by their last claim; this is a global recipient page.
      expectations: [
        { kind: 'queryBinds', token: 'claimed_at' },
        { kind: 'maxProcessedRows', relation: 'users', max: 20_100 },
        { kind: 'maxProcessedRows', relation: 'user_email_addresses', max: 20_100 },
      ],
      seededRows: { users: 20_100, user_email_addresses: 40_000 },
    })
    // no-mistakes-disable-next-line query-reached-per-item: three fixed recipient selectors need independent production SQL captures.
    await runAndCapture(id, async () => {
      const recipients = await run()
      if (recipients.length === 0) throw new Error(`${id} needs eligible recipients`)
      return recipients
    })
  }
}
