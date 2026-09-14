import type { MicrosoftStoreObservation } from './types.mts'
import type { MicrosoftStoreValidatedEvidence } from './authoritative-state-validation.mts'

type MicrosoftStoreLifecycle = {
  lifecycle: MicrosoftStoreObservation['lifecycle']
  terminalAt: Date | null
  expiresAt: Date
  autoRenews: boolean
}

/** Normalizes trusted provider facts into the one membership lifecycle representation. */
export function normalizeMicrosoftStoreLifecycle(
  evidence: MicrosoftStoreValidatedEvidence,
): MicrosoftStoreLifecycle | null {
  const { collection, recurrence, expiry, collectionEnd, now } = evidence
  const grace = parseDate(recurrence.expirationTimeWithGrace)
  const collectionTerminal = isCollectionTerminal(collection.status)
  const dunningExpiry = capDunningExpiry(grace, collectionEnd)
  const active = isActive(collection.status, recurrence.recurrenceState, expiry, dunningExpiry, now)
  const terminal = isTerminal(
    recurrence.recurrenceState,
    expiry,
    recurrence.recurrenceState === 'InDunning' ? dunningExpiry : grace,
    collectionTerminal,
    now,
  )
  if (!active && !terminal) return null

  return {
    lifecycle: lifecycleFor(collection.status, terminal),
    expiresAt: recurrence.recurrenceState === 'InDunning' && dunningExpiry ? dunningExpiry : expiry,
    terminalAt: terminalAtFor({
      collectionTerminal,
      collectionEnd,
      recurrence,
      expiry,
      now,
      terminal,
    }),
    autoRenews: active && recurrence.autoRenew === true,
  }
}

function capDunningExpiry(grace: Date | null, collectionEnd: Date): Date | null {
  if (!grace) return null
  return new Date(Math.min(grace.getTime(), collectionEnd.getTime()))
}

export function observationRevision(options: {
  evidence: MicrosoftStoreValidatedEvidence
  lifecycle: MicrosoftStoreLifecycle
}): Pick<MicrosoftStoreObservation, 'providerRevision' | 'providerOrder'> {
  const { collection, recurrence, revision, collectionRevision } = options.evidence
  return {
    providerRevision: `${recurrence.lastModified}:${collection.modifiedDate}:${collection.status}:${options.lifecycle.lifecycle}`,
    providerOrder: Math.max(revision.getTime(), collectionRevision.getTime()),
  }
}

function isActive(
  collectionStatus: MicrosoftStoreValidatedEvidence['collection']['status'],
  recurrenceState: MicrosoftStoreValidatedEvidence['recurrence']['recurrenceState'],
  expiry: Date,
  grace: Date | null,
  now: Date,
): boolean {
  if (collectionStatus !== 'Active') return false
  if (recurrenceState === 'Active') return expiry > now
  return recurrenceState === 'InDunning' && grace !== null && grace > now
}

function isTerminal(
  recurrenceState: MicrosoftStoreValidatedEvidence['recurrence']['recurrenceState'],
  expiry: Date,
  grace: Date | null,
  collectionTerminal: boolean,
  now: Date,
): boolean {
  if (collectionTerminal) return true
  if (
    recurrenceState === 'Inactive' ||
    recurrenceState === 'Canceled' ||
    recurrenceState === 'Failed'
  )
    return true
  return expiry <= now && !(recurrenceState === 'InDunning' && grace !== null && grace > now)
}

function isCollectionTerminal(
  status: MicrosoftStoreValidatedEvidence['collection']['status'],
): boolean {
  return status === 'Expired' || status === 'Revoked' || status === 'Banned'
}

function lifecycleFor(
  collectionStatus: MicrosoftStoreValidatedEvidence['collection']['status'],
  terminal: boolean,
): MicrosoftStoreObservation['lifecycle'] {
  if (collectionStatus === 'Revoked' || collectionStatus === 'Banned') return 'revoked'
  return terminal ? 'expired' : 'active'
}

function terminalAtFor(options: {
  collectionTerminal: boolean
  collectionEnd: Date
  recurrence: MicrosoftStoreValidatedEvidence['recurrence']
  expiry: Date
  now: Date
  terminal: boolean
}): Date | null {
  if (options.collectionTerminal)
    return new Date(Math.min(options.collectionEnd.getTime(), options.now.getTime()))
  if (!options.terminal) return null
  const dunningExpiry = capDunningExpiry(
    parseDate(options.recurrence.expirationTimeWithGrace),
    options.collectionEnd,
  )
  const expiry =
    options.recurrence.recurrenceState === 'InDunning' && dunningExpiry
      ? dunningExpiry
      : options.expiry
  const terminalAt = parseDate(options.recurrence.cancellationDate) ?? expiry
  return new Date(Math.min(terminalAt.getTime(), options.now.getTime()))
}

function parseDate(value: string | undefined): Date | null {
  const parsed = value ? new Date(value) : null
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null
}
