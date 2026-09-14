import type { MicrosoftStoreCollectionItem, MicrosoftStoreRecurrence } from './types.mts'

export type MicrosoftStoreAuthoritativeStateOptions = {
  applicationId: string
  environment: 'test' | 'production'
  publisherUserId: string
  membershipProductId: string
  productId: string
  skuId: string | null
  collection: MicrosoftStoreCollectionItem
  recurrence: MicrosoftStoreRecurrence
}

export type MicrosoftStoreValidatedEvidence = {
  collection: Required<
    Pick<MicrosoftStoreCollectionItem, 'id' | 'recurrenceData' | 'modifiedDate'>
  > &
    MicrosoftStoreCollectionItem
  recurrence: Required<
    Pick<MicrosoftStoreRecurrence, 'id' | 'startTime' | 'expirationTime' | 'lastModified'>
  > &
    MicrosoftStoreRecurrence
  effectiveAt: Date
  expiry: Date
  revision: Date
  collectionRevision: Date
  collectionEnd: Date
  now: Date
}

export type MicrosoftStoreEvidenceValidation =
  | { accepted: true; evidence: MicrosoftStoreValidatedEvidence }
  | { accepted: false; reasonCode: 'wrong_product' | 'invalid_evidence' }

/** Validates the cross-API facts that must be true before lifecycle normalization. */
export function validateMicrosoftStoreAuthoritativeEvidence(
  options: Pick<
    MicrosoftStoreAuthoritativeStateOptions,
    'collection' | 'recurrence' | 'productId' | 'skuId'
  >,
): MicrosoftStoreEvidenceValidation {
  const { collection, recurrence } = options
  if (collection.recurrenceData !== recurrence.id) return invalidEvidence()
  if (!hasExpectedProduct(options)) return wrongProduct()
  if (!hasRequiredCollectionEvidence(collection) || !hasRequiredRecurrenceEvidence(recurrence))
    return invalidEvidence()

  const timestamps = parseEvidenceTimestamps(collection, recurrence)
  if (!timestamps) return invalidEvidence()
  if (!hasValidEvidenceWindow(collection, timestamps)) return invalidEvidence()
  if (!hasStarted(collection, timestamps.effectiveAt, timestamps.now)) return invalidEvidence()

  return {
    accepted: true,
    evidence: { collection, recurrence, ...timestamps },
  }
}

function hasExpectedProduct(
  options: Pick<
    MicrosoftStoreAuthoritativeStateOptions,
    'collection' | 'recurrence' | 'productId' | 'skuId'
  >,
): boolean {
  const { collection, recurrence, productId, skuId } = options
  if (collection.productId !== productId || recurrence.productId !== productId) return false
  if (skuId !== null) return collection.skuId === skuId && recurrence.skuId === skuId
  return (collection.skuId ?? null) === (recurrence.skuId ?? null)
}

function hasRequiredCollectionEvidence(
  collection: MicrosoftStoreCollectionItem,
): collection is Required<
  Pick<MicrosoftStoreCollectionItem, 'id' | 'recurrenceData' | 'modifiedDate'>
> &
  MicrosoftStoreCollectionItem {
  return Boolean(collection.id && collection.recurrenceData && collection.modifiedDate)
}

function hasRequiredRecurrenceEvidence(
  recurrence: MicrosoftStoreRecurrence,
): recurrence is Required<
  Pick<MicrosoftStoreRecurrence, 'id' | 'startTime' | 'expirationTime' | 'lastModified'>
> &
  MicrosoftStoreRecurrence {
  return Boolean(
    recurrence.id && recurrence.startTime && recurrence.expirationTime && recurrence.lastModified,
  )
}

function parseEvidenceTimestamps(
  collection: MicrosoftStoreCollectionItem,
  recurrence: MicrosoftStoreRecurrence,
): Omit<MicrosoftStoreValidatedEvidence, 'collection' | 'recurrence'> | null {
  const recurrenceStart = parseDate(recurrence.startTime)
  const collectionStart =
    collection.startDate === undefined ? recurrenceStart : parseDate(collection.startDate)
  const expiry = parseDate(recurrence.expirationTime)
  const revision = parseDate(recurrence.lastModified)
  const collectionRevision = parseDate(collection.modifiedDate)
  const collectionEnd = parseDate(collection.endDate)
  if (
    !recurrenceStart ||
    !collectionStart ||
    !expiry ||
    !revision ||
    !collectionRevision ||
    !collectionEnd
  )
    return null
  const effectiveAt = new Date(Math.max(recurrenceStart.getTime(), collectionStart.getTime()))
  return { effectiveAt, expiry, revision, collectionRevision, collectionEnd, now: new Date() }
}

function hasValidEvidenceWindow(
  collection: MicrosoftStoreCollectionItem,
  timestamps: Omit<MicrosoftStoreValidatedEvidence, 'collection' | 'recurrence'>,
): boolean {
  if (
    timestamps.expiry < timestamps.effectiveAt ||
    timestamps.collectionEnd < timestamps.effectiveAt
  )
    return false
  return (
    collection.status !== 'Active' ||
    timestamps.collectionEnd.getTime() >= timestamps.expiry.getTime()
  )
}

function hasStarted(
  collection: MicrosoftStoreCollectionItem,
  effectiveAt: Date,
  now: Date,
): boolean {
  if (effectiveAt > now) return false
  if (collection.startDate === undefined) return true
  const collectionStart = parseDate(collection.startDate)
  return collectionStart !== null && collectionStart <= now
}

function parseDate(value: string | undefined): Date | null {
  const parsed = value ? new Date(value) : null
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null
}

function invalidEvidence(): MicrosoftStoreEvidenceValidation {
  return { accepted: false, reasonCode: 'invalid_evidence' }
}

function wrongProduct(): MicrosoftStoreEvidenceValidation {
  return { accepted: false, reasonCode: 'wrong_product' }
}
