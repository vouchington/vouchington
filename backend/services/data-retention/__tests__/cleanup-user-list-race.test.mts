import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestPost,
  createTestRetentionWindow,
  createTestUserDirect,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import {
  insertTestList,
  insertTestListPost,
  readTestListPostState,
} from '@voucha/test-helpers/entities/lists'
import { commitTestPostgresHolderAfterActionOrWait } from '@voucha/test-helpers/postgres-lock-skip'
import { cleanupUserListRows } from '../cleanup-user-cascade-rows.mts'

describe('user list retention', () => {
  it('erases a list and its in-flight entry without leaving an orphan', async () => {
    const owner = await createTestUserDirect()
    const { id: listId } = await insertTestList({ ownerUserId: owner.id, name: 'Retention list' })
    const { id: postId } = await createTestPost()
    await using admission = await beginTransaction()
    await insertTestListPost(admission, listId, postId)
    await softDeleteUserAt(owner.id, createTestRetentionWindow().firstEligibleDate)
    const processed = await commitTestPostgresHolderAfterActionOrWait(
      admission,
      'cleanupUserListRows:',
      async () => {
        await using retention = await beginTransaction()
        const result = await cleanupUserListRows(retention, owner.id, 1)
        await retention.commit()
        return result
      },
    )

    expect(processed).toBe(1)
    await expect(readTestListPostState(listId, postId)).resolves.toEqual({
      list_exists: false,
      entry_exists: false,
      post_exists: true,
    })
  })
})
