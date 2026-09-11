import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createSource } from '../create-source.mts'
import {
  getLockedCurrentMembership,
  getPurchaseDisposition,
  type IneligiblePurchaseDisposition,
} from '../ineligible-stripe-purchase-reversal-eligibility.mts'
import type { IneligibleStripePurchase } from '../ineligible-stripe-purchase-reversal-types.mts'

type PreparedIneligiblePurchaseReversal = {
  bindingBoundAt: Date | null
  bindingReleasedAt: Date | null
  disposition: IneligiblePurchaseDisposition
  originatingInvoiceId: string | null
}

export async function prepareIneligiblePurchaseReversal(
  options: IneligibleStripePurchase,
): Promise<PreparedIneligiblePurchaseReversal> {
  await using transaction = await beginTransaction()
  const membership = await getLockedCurrentMembership(options.userId, transaction)
  const disposition = getPurchaseDisposition(membership, options)
  const prepared =
    disposition === 'ineligible'
      ? await prepareBindingWindow(options, disposition, transaction)
      : { bindingBoundAt: null, bindingReleasedAt: null, disposition, originatingInvoiceId: null }
  await transaction.commit()
  return prepared
}

async function prepareBindingWindow(
  options: IneligibleStripePurchase,
  disposition: IneligiblePurchaseDisposition,
  query: QueryExecutor,
): Promise<PreparedIneligiblePurchaseReversal> {
  const source = await createSource(
    {
      userId: options.userId,
      stripeSubscriptionId: options.subscriptionId,
      stripeOriginatingInvoiceId: options.originatingInvoiceId,
      stripeCustomerId: options.customerId,
      providerEnvironment: options.providerEnvironment,
      providerApplicationId: options.providerApplicationId,
    },
    options.sku.id,
    query,
  )
  return getPreparedBindingWindow(source.lineageId, disposition, query)
}

async function getPreparedBindingWindow(
  lineageId: string | null,
  disposition: IneligiblePurchaseDisposition,
  query: QueryExecutor,
): Promise<PreparedIneligiblePurchaseReversal> {
  const { rows } = await query(sql`/* prepareIneligiblePurchaseReversal:binding window */
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM membership_lineage_bindings prior_binding
        WHERE prior_binding.membership_provider_lineage_id = binding.membership_provider_lineage_id
          AND prior_binding.source_kind = 'direct'
          AND (prior_binding.bound_at, prior_binding.id) < (binding.bound_at, binding.id)
      ) THEN binding.bound_at ELSE NULL END AS binding_bound_at,
        binding.released_at AS binding_released_at,
        binding.originating_invoice_id AS originating_invoice_id
      FROM membership_lineage_bindings binding
      WHERE binding.membership_provider_lineage_id = ${lineageId}
        AND binding.source_kind = 'direct'
        AND binding.released_at IS NULL
      ORDER BY binding.bound_at DESC, binding.id DESC
      LIMIT 1`)
  const binding = rows[0] as
    | {
        binding_bound_at: Date | null
        binding_released_at: Date | null
        originating_invoice_id: string | null
      }
    | undefined
  if (!binding) throw new Error('Ineligible Stripe purchase is missing its lineage binding')
  return {
    bindingBoundAt: binding.binding_bound_at,
    bindingReleasedAt: binding.binding_released_at,
    disposition,
    originatingInvoiceId: binding.originating_invoice_id,
  }
}
