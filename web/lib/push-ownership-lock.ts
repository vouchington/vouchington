'use client'

const ownershipLockName = 'voucha:web-push-ownership'

/** Serializes browser binding and server generation changes across same-origin tabs. */
export async function withWebPushOwnershipLock<T>(operation: () => Promise<T>): Promise<T> {
  const lockManager = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!lockManager) throw new Error('This browser cannot safely coordinate push notifications.')
  return lockManager.request(ownershipLockName, operation)
}
