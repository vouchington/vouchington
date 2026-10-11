import type { QueryExecutor } from '../backend/data-stores/psql/types.mts'
import type { SharedDbScopeEvent } from '../backend/data-stores/psql/shared-db-scope-observer.mts'
import { expect } from 'vitest'
import { ownedKeysetReadPolicy } from './vitest-owned-keyset-read-policy.mts'

const violationsKey = Symbol.for('voucha.vitest-shared-db-scope-violations')
const reportedKey = Symbol.for('voucha.vitest-shared-db-scope-reported')
type ViolationHost = Record<symbol, SharedDbScopeViolation[] | Map<string, number> | undefined>

export type SharedDbScopeViolation = {
  event: SharedDbScopeEvent
  message: string
  filepath: string
}

export function sharedDbScopeViolations(): readonly SharedDbScopeViolation[] {
  const host = globalThis as unknown as ViolationHost
  return (host[violationsKey] ??= []) as SharedDbScopeViolation[]
}

function reportedCounts(): Map<string, number> {
  const host = globalThis as unknown as ViolationHost
  return (host[reportedKey] ??= new Map()) as Map<string, number>
}

export function unreportedSharedDbScopeViolations(
  filepath: string,
): readonly SharedDbScopeViolation[] {
  return sharedDbScopeViolations()
    .filter(violation => violation.filepath === filepath)
    .slice(reportedCounts().get(filepath) ?? 0)
}

export function markSharedDbScopeViolationsReported(filepath: string): void {
  const count = sharedDbScopeViolations().filter(
    violation => violation.filepath === filepath,
  ).length
  reportedCounts().set(filepath, count)
}

export function sharedDbScopeTestIdentity(): string {
  const { testPath, currentTestName } = expect.getState()
  return testPath && currentTestName ? `${testPath}:${currentTestName}` : ''
}

export function recordSharedDbScopeViolation(event: SharedDbScopeEvent, message: string): void {
  const filepath = expect.getState().testPath
  if (!filepath) throw new Error(`Shared DB scope violation has no active test file: ${message}`)
  ;(sharedDbScopeViolations() as SharedDbScopeViolation[]).push({ event, message, filepath })
}

const reservationKey = Symbol.for('voucha.vitest-retained-relation-reservations')
type ReservationHost = Record<symbol, WeakMap<QueryExecutor, { owner: string }> | undefined>
const reservationHost = globalThis as unknown as ReservationHost
reservationHost[reservationKey] ??= new WeakMap<QueryExecutor, { owner: string }>()
const reservations = reservationHost[reservationKey]

/** Call only after acquiring every family lock on this rollback-only transaction. */
export function registerRetainedRelationCleanupReservation(query: QueryExecutor): () => void {
  const owner = sharedDbScopeTestIdentity()
  if (!owner || reservations.has(query))
    throw new Error('Retained relation reservation requires one active test transaction')
  const entry = { owner }
  reservations.set(query, entry)
  let closed = false
  return () => {
    if (closed) return
    closed = true
    if (reservations.get(query) === entry) reservations.delete(query)
  }
}

export function rejectUnscopedSharedDbCall(event: SharedDbScopeEvent): void {
  const owner = sharedDbScopeTestIdentity()
  const reservation = event.transaction ? reservations.get(event.transaction) : undefined
  if (
    event.operation === 'cleanupRetainedRelationIdentities' &&
    event.table === 'retained_relation_identity_cleanup_cursors' &&
    event.scope.kind === 'global' &&
    reservation &&
    owner &&
    reservation.owner === owner
  )
    return
  const scope = event.scope
  const requiresIds =
    event.operation === 'searchCopyrightStaffEmailIntakes' ||
    event.operation === 'listAvailableNotificationPushIntents'
  if (
    (scope.kind === 'ids' && scope.ids.length > 0 && scope.ids.every(id => id.length > 0)) ||
    (!requiresIds && scope.kind === 'cursor' && scope.id.length > 0)
  )
    return

  try {
    if (ownedKeysetReadPolicy.observe(event, sharedDbScopeTestIdentity())) return
  } catch (err) {
    const message = `[vitest-shared-db-scope] ${err instanceof Error ? err.message : String(err)}`
    recordSharedDbScopeViolation(event, message)
    throw err
  }

  const requiredScope =
    event.operation === 'searchCopyrightStaffEmailIntakes'
      ? 'fixture IDs or a proven owned keyset'
      : requiresIds
        ? 'fixture IDs'
        : 'fixture IDs or a real keyset cursor'
  const message = `[vitest-shared-db-scope] ${event.operation} on ${event.table} requires ${requiredScope}`
  recordSharedDbScopeViolation(event, message)
  throw new Error(message)
}
