import { randomUUID } from 'node:crypto'
import {
  claimCopyrightDeliveryIntent,
  markCopyrightDeliveryIntentEmailSent,
  markCopyrightDeliveryIntentSent,
} from '../../../services/copyright-notices/delivery-intents.mts'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'

/**
 * Sends every unfinished delivery of a notice, so no delivery is left to hold its retention clock.
 * An email goes the way the worker sends it, which also stamps the correspondence message it
 * carries as sent and so freezes its body.
 */
export async function sendAllCopyrightDeliveries(noticeId: string): Promise<void> {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  for (const intent of aggregate?.deliveryIntents ?? []) {
    if (intent.state !== 'pending') continue
    const claimed = await claimCopyrightDeliveryIntent(intent.id)
    if (!claimed) throw new Error('Copyright delivery fixture could not be claimed')
    const correspondenceId = intent.copyright_notice_correspondence_message_id
    const sent =
      intent.channel === 'email' && correspondenceId
        ? await markCopyrightDeliveryIntentEmailSent({
            intentId: intent.id,
            leaseToken: claimed.lease_token,
            correspondenceId,
            sesMessageId: `ses-${randomUUID()}`,
          })
        : await markCopyrightDeliveryIntentSent({
            intentId: intent.id,
            leaseToken: claimed.lease_token,
          })
    if (!sent) throw new Error('Copyright delivery fixture was not marked sent')
  }
}
