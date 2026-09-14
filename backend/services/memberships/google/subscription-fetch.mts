import type { GooglePlaySubscriptionV2, GooglePlaySubscriptionsV2Client } from './types.mts'

/** Fetches one authoritative response; callers validate its account/product before ancestry work. */
export async function fetchGooglePlaySubscription(options: {
  client: GooglePlaySubscriptionsV2Client
  applicationId: string
  purchaseToken: string
}): Promise<GooglePlaySubscriptionV2> {
  /* no-mistakes: integration=google-play */
  return options.client.getSubscription({
    packageName: options.applicationId,
    purchaseToken: options.purchaseToken,
  })
}
