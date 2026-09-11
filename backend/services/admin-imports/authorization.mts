import { isOwnerOrAdmin } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import type { ImportBatch } from './types.mts'

export function currentUserCanViewImportBatch(
  currentUser: PrivateUser | null,
  batch: Pick<ImportBatch, 'created_by_id'> | null,
): boolean {
  if (!batch) return false

  return isOwnerOrAdmin(currentUser, batch.created_by_id)
}
