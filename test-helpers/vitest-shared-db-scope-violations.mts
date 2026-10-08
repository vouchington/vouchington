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

export function rejectUnscopedSharedDbCall(event: SharedDbScopeEvent): void {
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
