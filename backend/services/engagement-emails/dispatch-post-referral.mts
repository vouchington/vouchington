import { getMarketingPostalAddress, getSiteUrl } from '@modules/utils'
import { getTrendingReferralPrograms } from '@services/trending-referral-programs/get-trending-referral-programs'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import { claimEngagementEmailSend } from '@services/users/engagement-emails'
import {
  enqueueSendPostReferralLinkEmail,
  enqueuePagePostReferralLinkEmail,
} from '@queues/email-digests/enqueues'
import type { PostReferralLinkEmailProps } from '@email-templates/core'
import pMap from 'p-map'
import { buildReferralProgramItems } from './recommendation-items.mts'
import {
  releaseEngagementClaim,
  reportEngagementDispatchError,
  sendJobId,
} from './dispatch-recipient-utils.mts'
import type { EngagementRecipient } from './recipient-page.mts'

export async function dispatchPostReferralLinkRecipients(
  recipients: EngagementRecipient[],
  ownerJobId?: string,
): Promise<void> {
  if (recipients.length === 0) return

  const programs = await getTrendingReferralPrograms({ limit: 5 })
  if (programs.referral_programs.length === 0) return

  const topics = await getTopicsByAnyBatch(programs.referral_programs.map(program => program.id))
  const referralPrograms = buildReferralProgramItems(programs.referral_programs, topics)

  if (referralPrograms.length === 0) return

  await pMap(
    recipients,
    recipient => dispatchPostReferralLinkEmail(recipient, referralPrograms, ownerJobId),
    {
      concurrency: 1,
      stopOnError: false,
    },
  )
}

async function dispatchPostReferralLinkEmail(
  recipient: EngagementRecipient,
  referralPrograms: PostReferralLinkEmailProps['referralPrograms'],
  ownerJobId?: string,
): Promise<void> {
  let claimed = false
  let admissionStarted = false
  try {
    if (!(await claimEngagementEmailSend(recipient.id, 'post_referral_link', ownerJobId))) return
    claimed = true

    const props: PostReferralLinkEmailProps = {
      userName: recipient.username ?? undefined,
      referralPrograms,
      settingsUrl: getSiteUrl('/my/referral-links'),
      unsubscribeUrl: getSiteUrl('/my/notification-settings'),
      physicalAddress: getMarketingPostalAddress(),
    }
    admissionStarted = true
    const input = {
      userId: recipient.id,
      uiLocale: recipient.ui_locale ?? null,
      ...(ownerJobId && { claimOwnerJobId: ownerJobId }),
    }
    if (ownerJobId)
      await enqueuePagePostReferralLinkEmail(
        input,
        props,
        sendJobId(ownerJobId, 'post_referral_link', recipient.id)!,
      )
    else await enqueueSendPostReferralLinkEmail(input, props)
  } catch (err) {
    /* c8 ignore start -- Defensive cleanup/observability for per-recipient enqueue failures. */
    if (claimed && !admissionStarted)
      await releaseEngagementClaim(recipient.id, 'post_referral_link', ownerJobId)
    reportEngagementDispatchError(err, 'post_referral_link', recipient.id)
    if (admissionStarted) throw err
    /* c8 ignore stop */
  }
}
