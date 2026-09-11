import type { ProcessSendRenewalPriceIncreaseEmailData } from '@queues/memberships/types'
import { renderRenewalPriceIncreaseEmail } from '@email-templates/core'
import { getSiteUrl } from '@modules/utils'
import { getVerifiedEmailAddress } from '@services/contribution-gating'
import { sendClassifiedEmail } from '@services/email-classification'
import {
  claimRenewalPriceIncreaseNotification,
  getCurrentRenewalPriceIncreaseDetails,
  markRenewalPriceIncreaseNotificationDeliveryAttempted,
  markRenewalPriceIncreaseNotificationDelivered,
  releaseRenewalPriceIncreaseNotification,
} from '@services/memberships'
import { getPrivateUserByAny } from '@services/users'

export async function processSendRenewalPriceIncreaseEmail(
  data: ProcessSendRenewalPriceIncreaseEmailData,
): Promise<unknown> {
  const claimToken = await claimRenewalPriceIncreaseNotification(
    data.membershipId,
    data.userId,
    data.membershipProviderObservationId,
  )
  if (!claimToken) return null

  let result: unknown
  let deliveryAttempted = false
  try {
    const [user, emailAddress, renewal] = await Promise.all([
      getPrivateUserByAny(data.userId),
      getVerifiedEmailAddress(data.userId),
      getCurrentRenewalPriceIncreaseDetails(
        data.membershipId,
        data.userId,
        data.membershipProviderObservationId,
        claimToken,
      ),
    ])
    if (!user || !emailAddress || !renewal) {
      await releaseRenewalPriceIncreaseNotification(
        data.membershipId,
        data.userId,
        data.membershipProviderObservationId,
        claimToken,
      )
      return null
    }

    const { subject, html, text } = await renderRenewalPriceIncreaseEmail({
      plan: renewal.plan,
      interval: renewal.interval,
      currentPrice: renewal.current_price,
      newPrice: renewal.new_price,
      renewsAt: renewal.expires_at.toISOString(),
      membershipUrl: getSiteUrl('/my/membership'),
      uiLocale: user.ui_locale,
    })

    deliveryAttempted = await markRenewalPriceIncreaseNotificationDeliveryAttempted(
      data.membershipId,
      data.userId,
      data.membershipProviderObservationId,
      claimToken,
    )
    if (!deliveryAttempted) {
      await releaseRenewalPriceIncreaseNotification(
        data.membershipId,
        data.userId,
        data.membershipProviderObservationId,
        claimToken,
      )
      return null
    }
    result = await sendClassifiedEmail('processSendRenewalPriceIncreaseEmail', {
      to: emailAddress,
      subject,
      html,
      text,
    })
  } catch (error) {
    if (!deliveryAttempted) {
      await releaseRenewalPriceIncreaseNotification(
        data.membershipId,
        data.userId,
        data.membershipProviderObservationId,
        claimToken,
      )
    }
    throw error
  }

  await markRenewalPriceIncreaseNotificationDelivered(
    data.membershipId,
    data.userId,
    data.membershipProviderObservationId,
    claimToken,
  )
  return result
}
