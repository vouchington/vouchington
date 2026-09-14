import { parseMicrosoftStoreLineageIdentity } from './lineage-identity.mts'

/** Restores the authoritative SKU and recurrence from the immutable source lineage. */
export function recoveryLineageIdentity(context: {
  applicationId: string
  providerProductId: string
  providerLineageId: string
}): { skuId: string | null; recurrenceId: string } {
  const identity = parseMicrosoftStoreLineageIdentity(context.providerLineageId)
  if (
    identity.applicationId !== context.applicationId ||
    identity.productId !== context.providerProductId
  )
    throw new Error('Microsoft Store source lineage has an invalid recurrence identity')
  return { skuId: identity.skuId, recurrenceId: identity.recurrenceId }
}
