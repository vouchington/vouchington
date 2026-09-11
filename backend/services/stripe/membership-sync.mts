import {
  DuplicateStripeMembershipEventError,
  getMembershipByStripeSubscriptionId,
  getRetainedDirectMembershipSourceByStripeIdentity,
  getStripePurchaseIntentOwner,
} from '@services/memberships'
import { getStripeCustomer } from '@modules/stripe/customers'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { beginTransaction } from '@data-stores/psql'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import {
  getLockedStripeMembershipSource,
  type StripeMembershipSourceRoute,
} from './membership-sync/locked-source.mts'
import { reconcileLockedStripeMembershipSource } from './membership-sync/reconcile-source.mts'
import { recoverConcurrentStripeMembershipSource } from './membership-sync/concurrent-source-recovery.mts'
import { syncOrCreateStripeMembershipInTransaction } from './membership-sync/sync-or-create.mts'
import { getStripeMembershipSourceIdentity } from './membership-sync/source-identity.mts'
import { getStripeSubscriptionMembershipValues } from './membership-sync/subscription-values.mts'
import { getStripeSubscriptionCustomerId } from './membership-sync/transaction.mts'
import { recordStripeMembershipProviderFacts } from './membership-provider-facts.mts'
import { MissingStripeMembershipFactContextError } from './membership-provider-facts/context.mts'

export async function ensureMembershipFromStripeSubscription(
  eventId: string,
  subscriptionId: string,
  customerId: string,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const subscriptionPromise = getStripeSubscription(subscriptionId).then(subscription => ({
    subscription,
    observedAt: new Date(),
  }))
  const [customer, subscriptionResult] = await Promise.all([
    getStripeCustomer(customerId),
    subscriptionPromise,
  ])
  const { subscription, observedAt } = subscriptionResult

  if ('deleted' in customer && customer.deleted) {
    throw new Error(`Stripe customer ${customerId} was deleted`)
  }
  const subscriptionCustomerId = getStripeSubscriptionCustomerId(subscription)
  if (subscriptionCustomerId && subscriptionCustomerId !== customerId)
    throw new Error(
      `Stripe subscription ${subscriptionId} customer does not match the event customer`,
    )

  const priceId = subscription.items.data[0]?.price?.id
  const purchaseIntentId = subscription.metadata?.membership_purchase_intent_id
  const intentOwner =
    purchaseIntentId && priceId
      ? await getStripePurchaseIntentOwner({
          purchaseIntentId,
          environment: subscription.livemode ? 'production' : 'test',
          providerProductId: priceId,
        })
      : null
  if (purchaseIntentId && !intentOwner)
    throw new Error(`Stripe subscription ${subscriptionId} has an invalid purchase intent`)
  const userId = intentOwner ?? customer.metadata?.userId
  if (!userId) {
    throw new Error(`Stripe customer ${customerId} is missing metadata.userId`)
  }

  const sourceIdentity = getStripeMembershipSourceIdentity(
    subscriptionId,
    subscription.livemode,
    applicationContext,
  )
  const values = await getStripeSubscriptionMembershipValues(subscription, sourceIdentity)

  const existingMembership = await getMembershipByStripeSubscriptionId(sourceIdentity)
  const retainedSource = existingMembership
    ? null
    : await getRetainedDirectMembershipSourceByStripeIdentity(sourceIdentity)
  const factMembershipId = existingMembership?.id ?? retainedSource?.membershipId
  try {
    if (factMembershipId) {
      try {
        let route: StripeMembershipSourceRoute | undefined
        await recordStripeMembershipProviderFacts({
          stripeEventId: eventId,
          membershipId: factMembershipId,
          subscription,
          observedAt,
          onLockedSource: async query => {
            route = await getLockedStripeMembershipSource(sourceIdentity, query)
          },
          onAcceptedObservation: async (query, lifecycleAt, evidenceId, snapshot) => {
            if (!route) throw new Error('Stripe membership route was not locked')
            await reconcileLockedStripeMembershipSource(
              eventId,
              sourceIdentity,
              values,
              query,
              lifecycleAt,
              route,
              evidenceId,
              snapshot,
            )
          },
        })
        return
      } catch (error) {
        if (!(error instanceof MissingStripeMembershipFactContextError)) throw error
      }
    }
    await using transaction = await beginTransaction()
    await syncOrCreateStripeMembershipInTransaction(
      {
        eventId,
        userId,
        subscriptionId,
        customerId,
        sourceIdentity,
        values,
        subscription,
        observedAt,
      },
      transaction,
    )
    await transaction.commit()
  } catch (error) {
    if (error instanceof DuplicateStripeMembershipEventError) return
    if (
      await recoverConcurrentStripeMembershipSource(error, {
        eventId,
        subscriptionId,
        sourceIdentity,
        applicationContext,
      })
    )
      return
    throw error
  }
}

export { syncMembershipFromStripeSubscription } from './membership-sync/sync-existing.mts'
