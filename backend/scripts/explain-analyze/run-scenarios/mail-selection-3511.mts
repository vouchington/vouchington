import {
  getFollowNewsSourcesRecipients,
  getFollowTopicsRecipients,
  getPostReferralLinkRecipients,
} from '@services/engagement-emails/dispatch-engagement-emails'
import { readEngagementRecipientPage } from '@services/engagement-emails/recipient-page'
import { resolveSeedAnchor } from '../seed-data/seed-anchor.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

/** The 20k-user seed has real primary addresses and followed/unfollowed groups. */
export async function runMailSelection3511Scenarios(): Promise<void> {
  const seededRows = {
    users: 20000,
    user_email_addresses: 20000,
    user_engagement_email_candidates: 60000,
  }
  const dispatchStartedAt = new Date()
  for (const [id, select] of [
    ['mail-follow-topics-recipients', () => getFollowTopicsRecipients()],
    ['mail-post-referral-recipients', () => getPostReferralLinkRecipients(dispatchStartedAt)],
    ['mail-follow-news-recipients', () => getFollowNewsSourcesRecipients(dispatchStartedAt)],
  ] as const) {
    registerScenarioContract(id, {
      seededRows,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'user_engagement_email_candidates', max: 600 },
      ],
    })
    // no-mistakes-disable-next-line query-reached-per-item: three fixed, separately named EXPLAIN captures share process-global query capture and must run serially.
    await runAndCapture(id, async () => {
      if ((await select()).length === 0) throw new Error(`Missing ${id} seed recipients`)
    })
  }

  registerScenarioContract('mail-post-referral-sparse-raw-page', {
    seededRows,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'user_engagement_email_candidates', max: 600 },
    ],
  })
  await runAndCapture('mail-post-referral-sparse-raw-page', async () => {
    const page = await readEngagementRecipientPage({
      type: 'post_referral_link',
      dispatchStartedAt: new Date(
        resolveSeedAnchor(process.env.EXPLAIN_SEED_ANCHOR_DATE).dayAnchorMs,
      ),
      rawLimit: 500,
      eligibleLimit: 250,
    })
    if (
      page.scannedCount !== 500 ||
      page.recipients.length !== 0 ||
      page.nextCursor?.lane !== 'unclaimed'
    )
      throw new Error('Expected a zero-eligible referral page with a raw continuation')
  })
}
