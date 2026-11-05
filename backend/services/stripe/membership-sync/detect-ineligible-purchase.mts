import { beginTransaction, write } from '@data-stores/psql'
import * as stripeInvoices from '@modules/stripe/invoices'
import { getStripeCustomer } from '@modules/stripe/customers'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { getStripePurchaseIntentOwner } from '@services/memberships'
import { getMembershipWorkLimit } from '@services/memberships/work-limits'
import { recordIneligibleStripePurchaseCaseForCollision } from '@services/memberships/ineligible-stripe-purchase-reversal/case-creation'
import { getMappedStripeMembershipInvoiceLines } from '@services/memberships/ineligible-stripe-purchase-reversal/case-producer'
import { isHigherMembershipPlan } from '@services/memberships/plan-ranking'
import { getDirectMembershipSourceAdmission } from '@services/memberships/direct-source-authority'
import type { StripeMembershipApplicationContext } from '@services/memberships/create-types'
import { getStripeMembershipSourceIdentity } from './source-identity.mts'
import sql from 'sql-template-strings'

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
  if (
    admission.accepted ||
    (admission.currentSourceKind !== 'family' &&
      (admission.currentSourceKind !== 'direct' || admission.currentProvider === 'stripe'))
  ) {
    await transaction.commit()
    return false
  }
  const { rows } = await transaction(
    buildGetWinningMembershipForStripePurchaseQuery(userId, new Date(line.period.start * 1_000)),
  )
  const winner = rows[0] as
    | { sourceKind: 'direct' | 'family'; plan: 'plus' | 'pro'; effectiveAt: Date }
    | undefined
  if (!winner || (winner.sourceKind === 'family' && isHigherMembershipPlan(plan, winner.plan))) {
    await transaction.commit()
    return false
  }
  const created = await recordIneligibleStripePurchaseCaseForCollision(
    {
      userId,
      sourceIdentity: { ...sourceIdentity, providerAccountId: customerId },
      invoice,
      stripePriceId,
      winningSourceKind: winner.sourceKind,
      collisionAt: winner.effectiveAt,
    },
    transaction,
  )
  await transaction.commit()
  return created
}

export function buildGetWinningMembershipForStripePurchaseQuery(
  userId: string,
  periodStartedAt: Date,
) {
  return sql`/* getWinningMembershipForStripePurchase */
    SELECT source.source_kind AS "sourceKind",
      (SELECT product.plan FROM membership_products product
        WHERE product.id = membership.membership_product_id) AS plan,
      membership.effective_at AS "effectiveAt"
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    LEFT JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    LEFT JOIN membership_provider_contexts context ON context.id = lineage.membership_provider_context_id
    WHERE membership.user_id = ${userId}
      AND membership.projection_ended_at IS NULL
      AND membership.cancelled_at IS NULL AND membership.expired_at IS NULL
      AND membership.paused_at IS NULL
      AND (membership.expires_at IS NULL OR membership.expires_at > ${periodStartedAt})
      AND (source.source_kind = 'family'
        OR (source.source_kind = 'direct' AND context.provider IN ('apple_app_store', 'google_play', 'microsoft_store')))
    LIMIT 1 FOR SHARE OF membership, source
  `
}

export function buildLockStripePurchaseOwnerForCollisionQuery(userId: string) {
  return sql`/* detectIneligibleStripePurchaseFromInvoicePayment:lockUser */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
}

export function buildGetBoundStripeSubscriptionOwnerForCollisionQuery(
  sourceIdentity: {
    environment: 'test' | 'production'
    applicationId: string
    providerLineageId: string
  },
  customerId: string,
) {
  return sql`/* getBoundStripeSubscriptionOwnerForCollision */
    SELECT source.user_id AS "userId"
    FROM membership_provider_contexts context
    INNER JOIN membership_provider_lineages lineage
      ON lineage.membership_provider_context_id = context.id
    INNER JOIN membership_lineage_bindings binding
      ON binding.membership_provider_lineage_id = lineage.id
    INNER JOIN membership_sources source
      ON source.membership_provider_lineage_id = lineage.id
      AND source.user_id = binding.user_id
    INNER JOIN users account ON account.id = source.user_id
    WHERE context.provider = 'stripe'
      AND context.environment = ${sourceIdentity.environment}
      AND context.application_id = ${sourceIdentity.applicationId}
      AND lineage.provider_lineage_id = ${sourceIdentity.providerLineageId}
      AND lineage.provider_account_id = ${customerId}
      AND binding.source_kind = 'direct' AND binding.released_at IS NULL
      AND source.source_kind = 'direct'
    LIMIT 1
  `
}
