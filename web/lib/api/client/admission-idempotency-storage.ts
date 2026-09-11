'use client'

import {
  claimAdmissionOwner,
  releaseAdmissionOwner,
  renewAdmissionOwner,
} from './admission-idempotency-owner-leases'
import {
  parseStoredAdmissionEntry,
  type AdmissionStoredEntry,
} from './admission-idempotency-storage-entry'

export const ADMISSION_STORAGE_PREFIX = 'voucha:admission-idempotency:v1:'
export const MAX_ADMISSION_STORAGE_ENTRIES = 100

export type AdmissionStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>

type StoredAdmissionEntry = {
  storageKey: string
  entry: AdmissionStoredEntry
}

export class AdmissionEntryStore {
  readonly #storage: AdmissionStorage | null
  readonly #now: () => number

  constructor(storage: AdmissionStorage | null, now: () => number) {
    this.#storage = storage
    this.#now = now
  }

  get(storageKey: string, intentFingerprint: string): AdmissionStoredEntry | undefined {
    if (!storageKey.startsWith(ADMISSION_STORAGE_PREFIX)) return undefined
    try {
      const value = this.#storage?.getItem(storageKey)
      if (!value) return undefined
      const entry = parseStoredAdmissionEntry(value, this.#now(), intentFingerprint)
      if (!entry) {
        this.remove(storageKey)
        return undefined
      }
      return entry
    } catch {
      this.remove(storageKey)
      return undefined
    }
  }

  set(
    storageKey: string,
    entry: AdmissionStoredEntry,
    protectedStorageKeys: ReadonlySet<string> = new Set(),
  ): boolean {
    if (!storageKey.startsWith(ADMISSION_STORAGE_PREFIX) || !this.#storage) return false
    try {
      const entries = this.#pruneInvalidEntries()
      const existing = entries.some(candidate => candidate.storageKey === storageKey)
      const entriesToRemove = entries.length + (existing ? 0 : 1) - MAX_ADMISSION_STORAGE_ENTRIES
      if (entriesToRemove > 0) {
        const candidates = entries
          .filter(
            candidate =>
              candidate.storageKey !== storageKey &&
              !protectedStorageKeys.has(candidate.storageKey) &&
              !candidate.entry.retryRequired &&
              Object.keys(candidate.entry.ownerLeases ?? {}).length === 0,
          )
          .toSorted(
            (left, right) =>
              left.entry.expiresAt - right.entry.expiresAt ||
              left.storageKey.localeCompare(right.storageKey),
          )
        if (candidates.length < entriesToRemove) return false
        for (const candidate of candidates.slice(0, entriesToRemove))
          this.#storage?.removeItem(candidate.storageKey)
      }
      this.#storage.setItem(storageKey, JSON.stringify({ version: 1, ...entry }))
      return true
    } catch {
      // Browser storage is best-effort.
      return false
    }
  }

  claim(
    storageKey: string,
    entry: AdmissionStoredEntry,
    ownerId: string,
    protectedStorageKeys: ReadonlySet<string> = new Set(),
  ): boolean {
    return this.set(
      storageKey,
      claimAdmissionOwner(entry, ownerId, this.#now()),
      protectedStorageKeys,
    )
  }

  renew(storageKey: string, entry: AdmissionStoredEntry, ownerId: string): boolean {
    return this.set(storageKey, renewAdmissionOwner(entry, ownerId, this.#now()))
  }

  release(
    storageKey: string,
    entry: AdmissionStoredEntry,
    ownerId: string,
    retryRequired: boolean,
    protectedStorageKeys: ReadonlySet<string> = new Set(),
  ): { entry: AdmissionStoredEntry; remove: boolean; persisted: boolean } {
    const result = releaseAdmissionOwner(entry, ownerId, this.#now(), retryRequired)
    let persisted = result.remove
      ? this.remove(storageKey)
      : this.set(storageKey, result.entry, protectedStorageKeys)
    if (result.remove && !persisted)
      persisted = this.set(storageKey, result.entry, protectedStorageKeys)
    return { ...result, persisted }
  }

  remove(storageKey: string): boolean {
    if (!storageKey.startsWith(ADMISSION_STORAGE_PREFIX)) return false
    try {
      if (!this.#storage) return false
      this.#storage.removeItem(storageKey)
      return true
    } catch {
      // Browser storage is best-effort.
      return false
    }
  }

  #pruneInvalidEntries(): StoredAdmissionEntry[] {
    const storage = this.#storage
    if (!storage) return []
    const now = this.#now()
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => key?.startsWith(ADMISSION_STORAGE_PREFIX) === true,
    )
    const entries: StoredAdmissionEntry[] = []
    for (const storageKey of keys) {
      try {
        const value = storage.getItem(storageKey)
        const entry = value ? parseStoredAdmissionEntry(value, now) : undefined
        if (!entry) {
          this.remove(storageKey)
          continue
        }
        entries.push({ storageKey, entry })
      } catch {
        this.remove(storageKey)
      }
    }
    return entries
  }
}

export function getAdmissionStorage(): AdmissionStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
