import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestNativeBlueskyCompletionFixture } from '@voucha/test-helpers/bluesky-native-completion-fixtures'
import { attachTestBlueskyAuthorizationWithLiveCompletion } from '@voucha/test-helpers/entities/bluesky-lifecycle-locks'
import {
  getTestBlueskyLinkedAccountRow,
  testBlueskyLinkCompletionExists,
} from '@voucha/test-helpers/entities/bluesky-linked-accounts'
import { observeTestPostgresQueryPools } from '@voucha/test-helpers/postgres-query-pool-observer'
import { finalizeNativeBlueskyAccountLink } from './native-completion.mts'

describe('native Bluesky completion admission', () => {
  it('returns not found after a competing consumer wins beyond discovery', async () => {
    const user = await createTestUser()
    const completion = await createTestNativeBlueskyCompletionFixture(user.id)
    const bothDiscovered = Promise.withResolvers<void>()
    let discoveryReads = 0
    const { result: results } = await observeTestPostgresQueryPools(
      '/* findNativeBlueskyLinkCompletion */',
      () =>
        Promise.allSettled([
          // Release a waiting peer if either consumer fails before its discovery read completes.
          finalizeCompletion(user.id, completion).finally(() => bothDiscovered.resolve()),
          finalizeCompletion(user.id, completion).finally(() => bothDiscovered.resolve()),
        ]),
      async () => {
        // Keep both real discovery results pending until both reads saw the live completion.
        discoveryReads += 1
        if (discoveryReads === 2) bothDiscovered.resolve()
        await bothDiscovered.promise
      },
    )
    expect(discoveryReads).toBe(2)
    expect(
      results
        .map(result => (result.status === 'fulfilled' ? 204 : result.reason.status))
        .toSorted(),
    ).toEqual([204, 404])
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
