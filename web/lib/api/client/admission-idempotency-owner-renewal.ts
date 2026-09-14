'use client'

import * as Sentry from '@sentry/nextjs'
import {
  type AdmissionLockManager,
  withAdmissionAllocationLock,
} from './admission-idempotency-lock'
import { ADMISSION_OWNER_LEASE_MS } from './admission-idempotency-owner-leases'
import type { AdmissionStoredEntry } from './admission-idempotency-storage-entry'
import { ADMISSION_STORAGE_PREFIX, AdmissionEntryStore } from './admission-idempotency-storage'

const ADMISSION_OWNER_RENEWAL_MS = ADMISSION_OWNER_LEASE_MS / 3

type OwnerRenewalOptions = {
  entry: Pick<AdmissionStoredEntry, 'intentFingerprint' | 'key'>
  lockManager: AdmissionLockManager | null
  ownerId: string
  storageKey: string
  store: AdmissionEntryStore
}

export function startAdmissionOwnerLeaseRenewal(options: OwnerRenewalOptions): () => void {
  const lockManager = options.lockManager
  if (!lockManager || !options.storageKey.startsWith(ADMISSION_STORAGE_PREFIX)) {
    return () => undefined
  }
  let active = true
  let timeout: ReturnType<typeof setTimeout>
  const schedule = (callback: () => Promise<void>) => {
    timeout = setTimeout(() => {
      callback().catch(Sentry.captureException)
    }, ADMISSION_OWNER_RENEWAL_MS)
  }
  const renew = async () => {
    try {
      await withAdmissionAllocationLock(options.storageKey, lockManager, () => {
        if (!active) return
        const current = options.store.get(options.storageKey, options.entry.intentFingerprint)
        if (current?.key === options.entry.key) {
          options.store.renew(options.storageKey, current, options.ownerId)
        }
      })
    } finally {
      if (active) schedule(renew)
    }
  }
  schedule(renew)
  return () => {
    active = false
    clearTimeout(timeout)
  }
}
