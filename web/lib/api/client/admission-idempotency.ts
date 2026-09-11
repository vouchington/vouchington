'use client'

import { settleWithin } from './bounded-settlement'
import {
  canonicalizeAdmissionIntent,
  fingerprintAdmissionIntent,
} from './admission-idempotency-intent'
import {
  identifyAdmissionIntent,
  type AdmissionFingerprintState,
} from './admission-idempotency-identify'
import {
  getActiveAdmissionStorageKeys,
  getAdmissionLockManager,
  withAdmissionAllocationLock,
} from './admission-idempotency-lock'
import { startAdmissionOwnerLeaseRenewal } from './admission-idempotency-owner-renewal'
import { ADMISSION_RETENTION_MS } from './admission-idempotency-storage-entry'
import {
  ADMISSION_STORAGE_PREFIX,
  AdmissionEntryStore,
  getAdmissionStorage,
} from './admission-idempotency-storage'
import type {
  AdmissionIdempotencyEntry as Entry,
  AdmissionIdempotencyOptions,
} from './admission-idempotency-types'

export class AdmissionIdempotency {
  readonly #entries = new Map<string, Entry>()
  readonly #activeRequests = new Set<Promise<unknown>>()
  readonly #generateKey: () => string
  readonly #lockManager: Exclude<AdmissionIdempotencyOptions['lockManager'], undefined>
  readonly #store: AdmissionEntryStore
  readonly #now: () => number
  readonly #fingerprint: (value: string) => Promise<string>
  readonly #fingerprintState: AdmissionFingerprintState = { available: true }
  #actorId: string | null | undefined
  readonly #ownerId = crypto.randomUUID()
  #paused = false
  #retainSuccessfulSettlements = false
  constructor(
    generateKey: () => string = () => crypto.randomUUID(),
    options: AdmissionIdempotencyOptions = {},
  ) {
    this.#generateKey = generateKey
    this.#lockManager =
      options.lockManager === undefined ? getAdmissionLockManager() : options.lockManager
    this.#now = options.now ?? Date.now
    this.#store = new AdmissionEntryStore(
      options.storage === undefined ? getAdmissionStorage() : options.storage,
      this.#now,
    )
    this.#fingerprint = options.fingerprint ?? fingerprintAdmissionIntent
    this.#actorId = options.actorId
  }
  async run<T>(
    intent: Record<string, unknown>,
    request: (idempotencyKey: string) => Promise<T>,
  ): Promise<T> {
    if (this.#paused) throw new Error('Admission submissions are paused')
    const activeRequest = this.#execute(intent, request)
    this.#activeRequests.add(activeRequest)
    try {
      return await activeRequest
    } finally {
      this.#activeRequests.delete(activeRequest)
    }
  }
  async #execute<T>(
    intent: Record<string, unknown>,
    request: (idempotencyKey: string) => Promise<T>,
  ): Promise<T> {
    const canonicalIntent = canonicalizeAdmissionIntent(intent)
    const { storageKey, intentFingerprint } = await identifyAdmissionIntent(
      canonicalIntent,
      this.#actorId,
      this.#fingerprint,
      this.#fingerprintState,
    )
    const entry = await withAdmissionAllocationLock(storageKey, this.#lockManager, () => {
      const entry = this.#getOrCreateEntry(storageKey, intentFingerprint)
      if (!entry.inFlight && storageKey.startsWith(ADMISSION_STORAGE_PREFIX)) {
        entry.expiresAt = this.#now() + ADMISSION_RETENTION_MS
        if (!this.#store.claim(storageKey, entry, this.#ownerId)) {
          this.#entries.delete(storageKey)
          throw new Error('Durable admission requires writable browser storage')
        }
      }
      return entry
    })
    if (entry.inFlight) return entry.inFlight as Promise<T>
    const requestPromise = Promise.resolve().then(() => request(entry.key))
    entry.inFlight = requestPromise
    const stopOwnerRenewal = startAdmissionOwnerLeaseRenewal({
      entry,
      lockManager: this.#lockManager,
      ownerId: this.#ownerId,
      storageKey,
      store: this.#store,
    })
    const inFlight = requestPromise.finally(stopOwnerRenewal)
    entry.inFlight = inFlight
    try {
      const response = await inFlight
      if (this.#entries.get(storageKey) === entry && entry.inFlight === inFlight) {
        const retryRequired = this.#retainSuccessfulSettlements
        if (storageKey.startsWith(ADMISSION_STORAGE_PREFIX)) {
          await withAdmissionAllocationLock(storageKey, this.#lockManager, () => {
            const persisted = this.#store.get(storageKey, intentFingerprint)
            if (persisted?.key === entry.key)
              this.#store.release(storageKey, persisted, this.#ownerId, retryRequired)
          })
          this.#entries.delete(storageKey)
        } else if (retryRequired) entry.inFlight = undefined
        else {
          this.#entries.delete(storageKey)
          this.#store.remove(storageKey)
        }
      }
      return response
    } catch (error) {
      if (this.#entries.get(storageKey) === entry && entry.inFlight === inFlight) {
        if (storageKey.startsWith(ADMISSION_STORAGE_PREFIX)) {
          let persistenceConfirmed = false,
            superseded = false
          await withAdmissionAllocationLock(storageKey, this.#lockManager, () => {
            const persisted = this.#store.get(storageKey, intentFingerprint)
            if (persisted && persisted.key !== entry.key) superseded = true
            if (persisted?.key === entry.key) {
              const result = this.#store.release(storageKey, persisted, this.#ownerId, true)
              persistenceConfirmed = result.persisted
              if (!result.persisted)
                this.#entries.set(storageKey, { ...entry, ...result.entry, inFlight: undefined })
            }
          })
          if (persistenceConfirmed || superseded) this.#entries.delete(storageKey)
          else if (this.#entries.get(storageKey) === entry) entry.inFlight = undefined
        } else entry.inFlight = undefined
      }
      throw error
    }
  }

  setActor(actorId: string | null): void {
    if (this.#actorId === actorId) return
    this.#entries.clear()
    this.#actorId = actorId
  }

  pause(): void {
    this.#paused = true
  }
  resume(): void {
    this.#paused = false
    this.#retainSuccessfulSettlements = false
  }
  drain(timeoutMs = 5000): Promise<boolean> {
    return settleWithin(this.#activeRequests, timeoutMs, () => {
      this.#retainSuccessfulSettlements = true
    })
  }
  #getOrCreateEntry(storageKey: string, intentFingerprint: string): Entry {
    const existing = this.#getEntry(storageKey, intentFingerprint)
    if (existing?.intentFingerprint === intentFingerprint) return existing
    const entry = {
      intentFingerprint,
      key: this.#generateKey(),
      expiresAt: this.#now() + ADMISSION_RETENTION_MS,
      ownerIds: [],
    }
    this.#entries.set(storageKey, entry)
    if (
      storageKey.startsWith(ADMISSION_STORAGE_PREFIX) &&
      !this.#store.set(storageKey, entry, getActiveAdmissionStorageKeys(this.#entries))
    ) {
      this.#entries.delete(storageKey)
      throw new Error('Durable admission requires writable browser storage')
    }
    return entry
  }

  #getEntry(storageKey: string, intentFingerprint: string): Entry | undefined {
    const memoryEntry = this.#entries.get(storageKey)
    if (memoryEntry?.inFlight || (memoryEntry && memoryEntry.expiresAt > this.#now()))
      return memoryEntry
    this.#entries.delete(storageKey)
    const persisted = this.#store.get(storageKey, intentFingerprint)
    if (!persisted) return undefined
    const entry: Entry = persisted
    this.#entries.set(storageKey, entry)
    return entry
  }
}

export const admissionIdempotency = new AdmissionIdempotency()
