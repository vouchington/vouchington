import { createTestUser } from '@voucha/test-helpers'
import { createUserDeletionRequest } from './services/user-deletions/create.mts'
import {
  getUserDeletionDispatchedAtForTest,
  getUserDeletionRequestForTest,
  makeUserDeletionRecoverableForTest,
} from '@voucha/test-helpers/services/user-deletions/user-deletion-lifecycle'

export async function createUserDeletionSweepNeighbor() {
  const user = await createTestUser()
  const request = await createUserDeletionRequest(user.id, user.id)
  await makeUserDeletionRecoverableForTest(request.id, 'stale')
  return { id: request.id, before: await readUserDeletionSweepNeighbor(request.id) }
}

export async function readUserDeletionSweepNeighbor(requestId: string) {
  return {
    request: await getUserDeletionRequestForTest(requestId),
    dispatchedAt: await getUserDeletionDispatchedAtForTest(requestId),
  }
}
