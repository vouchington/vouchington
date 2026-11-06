import { beginTransaction, write } from '@data-stores/psql'
import * as stripeInvoices from '@modules/stripe/invoices'
import { getStripeCustomer } from '@modules/stripe/customers'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { getStripePurchaseIntentOwner } from '@services/memberships'
import { getMembershipWorkLimit } from '@services/memberships/work-limits'
import { recordPreparedIneligibleStripePurchaseCasesForCollision } from '@services/memberships/ineligible-stripe-purchase-reversal/case-creation'
import { chooseEarliestQualifyingStripeCollision } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-resolution'
import { getMappedStripeMembershipInvoiceLines } from '@services/memberships/ineligible-stripe-purchase-reversal/case-producer'
import { getDirectMembershipSourceAdmission } from '@services/memberships/direct-source-authority'
import { createProviderMembershipSource } from '@services/memberships/provider-source'
import type { StripeMembershipApplicationContext } from '@services/memberships/create-types'
import { getStripeMembershipSourceIdentity } from './source-identity.mts'
import {
  buildGetBoundStripeSubscriptionOwnerForCollisionQuery,
  buildGetWinningMembershipForStripePurchaseQuery,
  buildLockStripePurchaseOwnerForCollisionQuery,
  getExistingCapturedStripeSource,
} from './captured-collision-source.mts'

export async function detectIneligibleStripePurchaseFromInvoicePayment(
  invoiceId: string,
  providerEnvironment: 'test' | 'production',
  applicationContext: StripeMembershipApplicationContext,
): Promise<boolean> {
  const retrievedInvoice = await stripeInvoices.getStripeInvoice(invoiceId)
  const subscriptionObject = retrievedInvoice.parent?.subscription_details?.subscription
  const subscriptionId =
    typeof subscriptionObject === 'string' ? subscriptionObject : subscriptionObject?.id
  if (!subscriptionId) return false
  const subscription = await getStripeSubscription(subscriptionId)
  if (subscription.livemode !== (providerEnvironment === 'production'))
    throw new Error(`Stripe invoice ${invoiceId} environment does not match its subscription`)
  const sourceIdentity = getStripeMembershipSourceIdentity(
    subscriptionId,
    subscription.livemode,
    applicationContext,
  )
  const invoiceLimits = {
    invoicePages: getMembershipWorkLimit('stripe_subscription_invoice_max_pages'),
    paymentPages: getMembershipWorkLimit('stripe_invoice_payment_max_pages'),
    linePages: getMembershipWorkLimit('stripe_invoice_line_max_pages'),
  }
  const invoices = await stripeInvoices.listAllStripeSubscriptionInvoices(
    subscriptionId,
    invoiceLimits,
  )
  const invoice = invoices.find(candidate => candidate.id === invoiceId)
  if (!invoice) throw new Error(`Stripe invoice ${invoiceId} was not found in its subscription`)
  if (invoice.status !== 'open' && invoice.status !== 'paid') return false
  const mappedLines = await getMappedStripeMembershipInvoiceLines(invoice, sourceIdentity)
  if (mappedLines.length === 0) return false
  if (mappedLines.length !== 1 || invoice.lines.data.length !== 1)
    throw new Error(`Stripe invoice ${invoiceId} has ambiguous membership purchase lines`)
  const { line, priceId: stripePriceId, plan } = mappedLines[0]!
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  const { rows: boundOwnerRows } = await write(
    buildGetBoundStripeSubscriptionOwnerForCollisionQuery(sourceIdentity, customerId),
  )
  const boundOwner = boundOwnerRows[0] as { userId: string } | undefined
  const purchaseIntentId = subscription.metadata?.membership_purchase_intent_id
  const intentOwner =
    !boundOwner && purchaseIntentId
      ? await getStripePurchaseIntentOwner({
          purchaseIntentId,
          environment: sourceIdentity.environment,
          providerProductId: stripePriceId,
        })
      : null
  if (purchaseIntentId && !boundOwner && !intentOwner)
    throw new Error(`Stripe subscription ${subscriptionId} has an invalid purchase intent`)
  const customer = boundOwner || intentOwner ? null : await getStripeCustomer(customerId)
  const userId =
    boundOwner?.userId ??
    intentOwner ??
    (customer && !('deleted' in customer && customer.deleted) ? customer.metadata?.userId : null)
  if (!userId) throw new Error(`Stripe subscription ${subscriptionId} has no purchase owner`)
  await using transaction = await beginTransaction()
  await transaction(buildLockStripePurchaseOwnerForCollisionQuery(userId))
  const admission = await getDirectMembershipSourceAdmission(
    userId,
    plan,
    sourceIdentity,
    transaction,
  )
  const currentCanWin =
    !admission.accepted &&
    (admission.currentSourceKind === 'family' ||
      (admission.currentSourceKind === 'direct' && admission.currentProvider !== 'stripe'))
  const currentRows = currentCanWin
    ? (
        await transaction(
          buildGetWinningMembershipForStripePurchaseQuery(
            userId,
            new Date(line.period.start * 1_000),
          ),
        )
      ).rows
    : []
  const current = currentRows[0] as
    | { sourceKind: 'direct' | 'family'; plan: 'plus' | 'pro'; effectiveAt: Date }
    | undefined
  const capturedSource = await getExistingCapturedStripeSource(
    { userId, sourceIdentity, customerId, purchasePlan: plan },
    transaction,
  )
  if (!current && !capturedSource) {
    await transaction.commit()
    return false
  }
  const fullSourceIdentity = {
    ...sourceIdentity,
    providerAccountId: capturedSource ? capturedSource.providerAccountId : customerId,
  }
  const source =
    capturedSource ??
    (await createProviderMembershipSource(
      { userId, sourceKind: 'direct', sourceIdentity: fullSourceIdentity },
      transaction,
    ))
  const winner = chooseEarliestQualifyingStripeCollision(
    capturedSource ?? undefined,
    current
      ? {
          winningSourceKind: current.sourceKind,
          winningPlan: current.plan,
          collisionAt: current.effectiveAt,
        }
      : null,
    plan,
  )
  if (!winner) {
    await transaction.commit()
    return false
  }
  const created = await recordPreparedIneligibleStripePurchaseCasesForCollision(
    [
      {
        sourceIdentity: fullSourceIdentity,
        invoice,
        stripePriceId,
        winningSourceKind: winner.winningSourceKind,
        collisionAt: winner.collisionAt,
      },
    ],
    source,
    transaction,
  )
  await transaction.commit()
  return created.includes(invoice.id)
}
