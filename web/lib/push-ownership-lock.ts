'use client'

import { withWebLock } from '@vouchington/utils/web-push-binding'

const ownershipLockName = 'voucha:web-push-ownership'

/** Serializes browser binding and server generation changes across same-origin tabs. */
export async function withWebPushOwnershipLock<T>(operation: () => Promise<T>): Promise<T> {
  return withWebLock(ownershipLockName, operation)
}
