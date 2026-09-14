import type { MicrosoftStoreCollectionItem, MicrosoftStoreRecurrence } from './types.mts'
import { normalizeMicrosoftStoreLifecycle } from './authoritative-state-lifecycle.mts'
import { validateMicrosoftStoreAuthoritativeEvidence } from './authoritative-state-validation.mts'

export type AuthoritativeRecordSelectionOptions = {
  collections: MicrosoftStoreCollectionItem[]
  recurrences: MicrosoftStoreRecurrence[]
  productId: string
  skuId: string | null
  sourceSkuId?: string | null
  recurrenceId?: string | null
}

export function collectMatchedRecords(
  options: AuthoritativeRecordSelectionOptions,
  requestedRecurrenceId: string | null,
): { records: Map<string, MicrosoftStoreCollectionItem>; crossApiLag: boolean } {
  const recurrencesById = new Map<string, MicrosoftStoreRecurrence>()
  for (const recurrence of options.recurrences) {
    if (recurrence.id && (!requestedRecurrenceId || recurrence.id === requestedRecurrenceId))
      recurrencesById.set(recurrence.id, recurrence)
  }
  const records = new Map<string, MicrosoftStoreCollectionItem>()
  let crossApiLag = options.recurrences.some(
    candidate =>
      candidate.productId === options.productId && expectedSkuMatches(options, candidate.skuId),
  )
  for (const candidate of options.collections) {
    const recurrenceId = candidate.recurrenceData
    if (
      candidate.productId !== options.productId ||
      !expectedSkuMatches(options, candidate.skuId) ||
      (requestedRecurrenceId !== null && recurrenceId !== requestedRecurrenceId) ||
      !recurrenceId
    )
      continue
    const recurrence = recurrencesById.get(recurrenceId)
    if (!matchesCollection(options, candidate, recurrence)) {
      crossApiLag = true
      continue
    }
    if (preferredCollection(candidate, records.get(recurrenceId)))
      records.set(recurrenceId, candidate)
  }
  return { records, crossApiLag }
}

export function selectPreferredRecord(
  options: AuthoritativeRecordSelectionOptions,
  collectionsByRecurrence: Map<string, MicrosoftStoreCollectionItem>,
): { collection: MicrosoftStoreCollectionItem; recurrence: MicrosoftStoreRecurrence } | null {
  const recurrencesById = new Map(
    options.recurrences.flatMap(recurrence => (recurrence.id ? [[recurrence.id, recurrence]] : [])),
  )
  let selected: {
    collection: MicrosoftStoreCollectionItem
    recurrence: MicrosoftStoreRecurrence
  } | null = null
  for (const [recurrenceId, collection] of collectionsByRecurrence) {
    const recurrence = recurrencesById.get(recurrenceId)
    if (!recurrence || !preferredRecord(options, { collection, recurrence }, selected)) continue
    selected = { collection, recurrence }
  }
  return selected
}

function matchesCollection(
  options: AuthoritativeRecordSelectionOptions,
  collection: MicrosoftStoreCollectionItem,
  recurrence: MicrosoftStoreRecurrence | undefined,
): recurrence is MicrosoftStoreRecurrence {
  return Boolean(
    recurrence &&
    recurrence.productId === options.productId &&
    expectedSkuMatches(options, recurrence.skuId) &&
    recurrence.skuId === collection.skuId,
  )
}

function expectedSkuMatches(
  options: Pick<AuthoritativeRecordSelectionOptions, 'skuId' | 'sourceSkuId'>,
  skuId: string | undefined,
): boolean {
  const expectedSkuId = options.sourceSkuId ?? options.skuId
  return expectedSkuId === null || expectedSkuId === undefined || skuId === expectedSkuId
}

function preferredRecord(
  options: AuthoritativeRecordSelectionOptions,
  candidate: { collection: MicrosoftStoreCollectionItem; recurrence: MicrosoftStoreRecurrence },
  current: {
    collection: MicrosoftStoreCollectionItem
    recurrence: MicrosoftStoreRecurrence
  } | null,
): boolean {
  if (!current) return true
  const candidateIsActive = entitlesNow(options, candidate.recurrence, candidate.collection)
  const currentIsActive = entitlesNow(options, current.recurrence, current.collection)
  return (
    (candidateIsActive && !currentIsActive) ||
    (candidateIsActive === currentIsActive &&
      Date.parse(candidate.recurrence.lastModified ?? '') >
        Date.parse(current.recurrence.lastModified ?? ''))
  )
}

function entitlesNow(
  options: Pick<AuthoritativeRecordSelectionOptions, 'productId' | 'skuId'>,
  recurrence: MicrosoftStoreRecurrence,
  collection: MicrosoftStoreCollectionItem,
): boolean {
  const validation = validateMicrosoftStoreAuthoritativeEvidence({
    ...options,
    collection,
    recurrence,
  })
  return (
    validation.accepted &&
    normalizeMicrosoftStoreLifecycle(validation.evidence)?.lifecycle === 'active'
  )
}

function preferredCollection(
  candidate: MicrosoftStoreCollectionItem,
  current: MicrosoftStoreCollectionItem | undefined,
): boolean {
  if (!current) return true
  const candidateModifiedAt = Date.parse(candidate.modifiedDate ?? '')
  const currentModifiedAt = Date.parse(current.modifiedDate ?? '')
  if (Number.isFinite(candidateModifiedAt) && Number.isFinite(currentModifiedAt))
    return (
      candidateModifiedAt > currentModifiedAt ||
      (candidateModifiedAt === currentModifiedAt &&
        isTerminalCollection(candidate.status) &&
        !isTerminalCollection(current.status))
    )
  if (Number.isFinite(candidateModifiedAt) !== Number.isFinite(currentModifiedAt))
    return Number.isFinite(candidateModifiedAt)
  return isTerminalCollection(candidate.status) && !isTerminalCollection(current.status)
}

function isTerminalCollection(status: MicrosoftStoreCollectionItem['status']): boolean {
  return status === 'Expired' || status === 'Revoked' || status === 'Banned'
}
