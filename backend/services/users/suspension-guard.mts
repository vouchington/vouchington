import { createCodedError } from '@modules/on-error/create-coded-error'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import type { PrivateUser } from './types.mts'

export function assertNotSuspended(currentUser: PrivateUser | null | undefined): void {
  if (currentUser?.suspended_at) {
    throw createCodedError(403, 'Your account has been suspended', ACCOUNT_SUSPENDED)
  }
}
