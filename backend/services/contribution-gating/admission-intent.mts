import { createHash, randomUUID } from 'node:crypto'
import { isUUID } from '@modules/utils'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { INVALID_INPUT } from '@modules/on-error/error-codes'

export function canonicalizeAdmissionIntent(intent: unknown): string {
  return JSON.stringify(canonicalize(intent))
}

export function hashAdmissionIntent(intent: unknown): string {
  return createHash('sha256').update(canonicalizeAdmissionIntent(intent)).digest('hex')
}

export type ContributionAdmissionIdentity = {
  idempotencyKey: string
  callerSupplied: boolean
  callerCanReplay: boolean
}

export function resolveAdmissionIdentity(
  headerValue: string | null,
): ContributionAdmissionIdentity {
  if (headerValue === null)
    return { idempotencyKey: randomUUID(), callerSupplied: false, callerCanReplay: false }
  if (!isUUID(headerValue))
    throw createCodedError(400, 'Idempotency-Key must be a UUID', INVALID_INPUT)
  return { idempotencyKey: headerValue, callerSupplied: true, callerCanReplay: true }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    )
  return value
}
