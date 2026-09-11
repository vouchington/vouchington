import type { AdmissionLockManager } from './admission-idempotency-lock'
import type { AdmissionStoredEntry } from './admission-idempotency-storage-entry'
import type { AdmissionStorage } from './admission-idempotency-storage'

export type AdmissionIdempotencyEntry = AdmissionStoredEntry & { inFlight?: Promise<unknown> }

export type AdmissionIdempotencyOptions = {
  actorId?: string | null
  lockManager?: AdmissionLockManager | null
  storage?: AdmissionStorage | null
  now?: () => number
  fingerprint?: (value: string) => Promise<string>
}
