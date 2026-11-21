import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { beginTransaction, createTestUser, insertTestPost, restoreUser } from '@voucha/test-helpers'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import sql from 'sql-template-strings'
import { createDataRequest, markDataRequestProcessing } from '../account-data-requests/index.mts'
import { lockActiveDataRequestUser } from '../account-data-requests/active-user-lock.mts'
import { lockPostUpdateMutationScopes } from '../posts/category-user-locks.mts'
import { deleteUser } from './delete.mts'

/**
 * A user-owned writer that fenced before deletion holds `FOR SHARE` on the users row, so the
 * privacy fence (`FOR NO KEY UPDATE`) waits for it; writers that arrive afterwards are rejected.
 */
describe('user deletion fence', () => {
  it('waits for an in-flight post-category editor, then rejects later edits', async () => {
    const owner = await createTestUser()
    const editor = await createTestUser()
    const postId = await insertTestPost({
      title: `Fence ${v7()}`,
      slug: `fence-${v7()}`,
      createdById: owner.id,
      markdown: 'test',
    })
    await using writer = await beginTransaction()
    const holderProcessId = await getTestPostgresBackendProcessId(writer)
    await lockPostUpdateMutationScopes(writer, postId, editor.id, { title: 'edited' })

    const accepted = await withTestOwnedPostgresWait(
      {
        pool: 'write',
        holderProcessId,
        lock: { kind: 'transaction' },
        queryMarker: 'deleteUser:lockUserRow',
        releaseHolder: () => writer[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const deletion = deleteUser(editor, editor)
        await waitForLock(deletion)
        await writer.commit()
        return deletion
      },
    )
    expect(accepted.requestId).toBeDefined()

    await using late = await beginTransaction()
    await expect(
      lockPostUpdateMutationScopes(late, postId, editor.id, { title: 'late' }),
    ).rejects.toThrow('cannot own new data after deletion')
  })

  it('waits for an in-flight data-export claim, then refuses to start another', async () => {
    const user = await createTestUser()
    const request = await createDataRequest(user.id, user.id)
    await using writer = await beginTransaction()
    const holderProcessId = await getTestPostgresBackendProcessId(writer)
    expect(await lockActiveDataRequestUser(writer, user.id)).toBe(true)
    await writer(sql`/* deletionFenceTest:recordAttempt */
      INSERT INTO user_data_request_attempts (request_id, processing_attempt_id)
      VALUES (${request.id}, ${request.processing_attempt_id})
    `)

    try {
      await withTestOwnedPostgresWait(
        {
          pool: 'write',
          holderProcessId,
          lock: { kind: 'transaction' },
          queryMarker: 'deleteUser:lockUserRow',
          releaseHolder: () => writer[Symbol.asyncDispose](),
        },
        async waitForLock => {
          const deletion = deleteUser(user, user)
          await waitForLock(deletion)
          await writer.commit()
          await deletion
        },
      )
      await expect(markDataRequestProcessing(request.id)).resolves.toBe(false)
    } finally {
      await restoreUser(user.id)
    }
  })
})
