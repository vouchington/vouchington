import type { PrivateUser } from '@voucha/types/entities/user'
import { cleanupSoftDeletedUsers } from '../services/data-retention/cleanup.mts'
import { createTestRetentionWindow } from './data.mts'
import { softDeleteUserAt } from './entities/users-lifecycle.mts'
import { deleteUserAndDrainForTest } from './services/users/delete-test-support.mts'

/** Exercises production deletion and final retention cleanup for one isolated uploader. */
export async function purgeUploaderForTest(user: PrivateUser): Promise<void> {
  const window = createTestRetentionWindow()
  await deleteUserAndDrainForTest(user, user)
  await softDeleteUserAt(user.id, window.firstEligibleDate)
  await cleanupSoftDeletedUsers(window)
}
