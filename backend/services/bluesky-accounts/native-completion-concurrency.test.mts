import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestNativeBlueskyCompletionFixture } from '@voucha/test-helpers/bluesky-native-completion-fixtures'
import { attachTestBlueskyAuthorizationWithLiveCompletion } from '@voucha/test-helpers/entities/bluesky-lifecycle-locks'
import { holdTestUserRowLock } from '@voucha/test-helpers/entities/user-deletion-actor-locks'
import {
  getTestBlueskyLinkedAccountRow,
  testBlueskyLinkCompletionExists,
} from '@voucha/test-helpers/entities/bluesky-linked-accounts'
import {
  waitForTestPostgresLockWaiter,
  waitForTestPostgresBlockedLockChain,
} from '@voucha/test-helpers/postgres-lock-wait'
import { finalizeNativeBlueskyAccountLink } from './native-completion.mts'

describe('native Bluesky completion admission', () => {
  it('returns not found after a competing consumer wins beyond discovery', async () => {
    const user = await createTestUser()
    const completion = await createTestNativeBlueskyCompletionFixture(user.id)
    const fence = await holdTestUserRowLock(user.id)
    const consumers: Promise<void>[] = []
    try {
      consumers.push(finalizeCompletion(user.id, completion))
      void consumers[0]!.catch(() => undefined)
      await waitForTestPostgresLockWaiter(
        fence.holderProcessId,
        'lockOAuthAccountConnectionUserRow',
        'advisoryLock',
      )
      consumers.push(finalizeCompletion(user.id, completion))
      void consumers[1]!.catch(() => undefined)
      // Both discovered the live completion; the second waits behind the first's user fence.
      await waitForTestPostgresBlockedLockChain(
        fence.holderProcessId,
        'lockOAuthAccountConnectionUserRow',
        ['lockOAuthAccountConnectionUser'],
      )
    } finally {
      fence.release()
      await fence.completed
      await Promise.allSettled(consumers)
    }
    const results = await Promise.allSettled(consumers)
    expect(results).toMatchObject([
      { status: 'fulfilled' },
      { status: 'rejected', reason: { status: 404 } },
    ])
    expect((await getTestBlueskyLinkedAccountRow(completion.did))?.user_id).toBe(user.id)
    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(false)
  })

  it('rejects an attached authorization whose completion still exists', async () => {
    const user = await createTestUser()
    const completion = await createTestNativeBlueskyCompletionFixture(user.id)
    await attachTestBlueskyAuthorizationWithLiveCompletion(completion.flowId)

    await expect(finalizeCompletion(user.id, completion)).rejects.toMatchObject({ status: 401 })
    expect(await testBlueskyLinkCompletionExists(completion.flowId)).toBe(true)
    expect((await getTestBlueskyLinkedAccountRow(completion.did))?.user_id).toBeNull()
  })
})

function finalizeCompletion(
  userId: string,
  completion: Awaited<ReturnType<typeof createTestNativeBlueskyCompletionFixture>>,
) {
  return finalizeNativeBlueskyAccountLink(
    userId,
    completion.session,
    completion.flowId,
    completion.token,
    completion.verifier,
    () => new Date(),
  )
}
