import type { TransactionQuery } from '@data-stores/psql'
import type { ContributionAdmissionAudit } from './admission-reservations.mts'
import type { ContributionAdmissionPolicy, ContributionPolicySource } from './policy.mts'

export type ContributionAdmissionResult<T> =
  | { kind: 'created'; response: T }
  | { kind: 'replay'; response: T }
  | { kind: 'in_progress'; retryAfterSeconds: number }

export type ContributionAdmissionInput<T> = {
  actorId: string
  idempotencyKey: string
  callerCanReplayIdempotencyIdentity?: boolean
  intent: unknown
  policy?: ContributionAdmissionPolicy
  source?: ContributionPolicySource
  capacityExempt?: boolean
  audit?: ContributionAdmissionAudit
  beforeCapacity?: () => Promise<void>
  beforeCommit?: () => Promise<void>
  execute: (query: TransactionQuery) => Promise<T>
}
