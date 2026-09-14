export type MicrosoftStoreLineageIdentity = {
  applicationId: string
  productId: string
  skuId: string | null
  recurrenceId: string
}

/** Serializes Store identifiers losslessly because recurrence and SKU IDs are opaque strings. */
export function createMicrosoftStoreLineageIdentity(
  identity: MicrosoftStoreLineageIdentity,
): string {
  return JSON.stringify([
    identity.applicationId,
    identity.productId,
    identity.skuId,
    identity.recurrenceId,
  ])
}

export function parseMicrosoftStoreLineageIdentity(
  providerLineageId: string,
): MicrosoftStoreLineageIdentity {
  let raw: unknown
  try {
    raw = JSON.parse(providerLineageId)
  } catch {
    throw new Error('Microsoft Store source lineage has an invalid identity')
  }
  if (!Array.isArray(raw) || raw.length !== 4)
    throw new Error('Microsoft Store source lineage has an invalid identity')
  const [applicationId, productId, skuId, recurrenceId] = raw
  if (
    typeof applicationId !== 'string' ||
    typeof productId !== 'string' ||
    (typeof skuId !== 'string' && skuId !== null) ||
    typeof recurrenceId !== 'string' ||
    !applicationId ||
    !productId ||
    !recurrenceId
  )
    throw new Error('Microsoft Store source lineage has an invalid identity')
  return { applicationId, productId, skuId, recurrenceId }
}
