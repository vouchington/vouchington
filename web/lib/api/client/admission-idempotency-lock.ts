import { ADMISSION_STORAGE_PREFIX } from './admission-idempotency-storage'

const ADMISSION_STORAGE_LOCK = 'voucha:admission-storage:v1'

export type AdmissionLockManager = {
  request<T>(name: string, callback: () => Promise<T> | T): Promise<T>
}

export async function withAdmissionAllocationLock<T>(
  storageKey: string,
  lockManager: AdmissionLockManager | null,
  callback: () => Promise<T> | T,
): Promise<T> {
  if (!storageKey.startsWith(ADMISSION_STORAGE_PREFIX)) return callback()
  if (!lockManager) throw new Error('Durable admission requires browser Web Locks support')
  return lockManager.request(ADMISSION_STORAGE_LOCK, () =>
    lockManager.request(`voucha:admission-allocation:${storageKey}`, callback),
  )
}

export function getActiveAdmissionStorageKeys(
  entries: ReadonlyMap<string, { inFlight?: Promise<unknown> }>,
): Set<string> {
  const activeStorageKeys = new Set<string>()
  for (const [key, entry] of entries) {
    if (entry.inFlight) activeStorageKeys.add(key)
  }
  return activeStorageKeys
}

export function getAdmissionLockManager(): AdmissionLockManager | null {
  try {
    return typeof navigator === 'undefined' || !navigator.locks ? null : navigator.locks
  } catch {
    return null
  }
}
