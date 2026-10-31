import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { holdTestPostRowLock } from '@voucha/test-helpers/entities/post-clearance-row-lock'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { testBlockedBackendHoldsRelation } from '@voucha/test-helpers/postgres-lock-wait'

describe('setTestPostClearanceStatus lock order', () => {
  it('writes clearance history before it waits on the post row', async () => {
    const user = await createTestUser()
    const suffix = randomUUID()
    const postId = await insertTestPost({
      title: `Clearance lock order ${suffix}`,
      slug: `clearance-lock-order-${suffix}`,
      markdown: 'A post held while clearance history is written.',
      createdById: user.id,
      clearanceStatus: 'pending',
    })
    const holder = await holdTestPostRowLock(postId)
    await withTestOwnedPostgresWait(
      {
        holderProcessId: holder.holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'setTestPostClearanceStatus',
        releaseHolder: async () => {
          holder.release()
          await holder.completed
        },
      },
      async waitForLock => {
        const writing = setTestPostClearanceStatus(postId, 'approved', user.id)
        await waitForLock(writing)
        expect(
          await testBlockedBackendHoldsRelation(holder.holderProcessId, 'post_clearance_changes'),
        ).toBe(true)
        holder.release()
        await holder.completed
        await writing
      },
    )
  })
})
