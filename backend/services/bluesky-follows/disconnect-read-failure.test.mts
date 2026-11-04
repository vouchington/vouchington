import type { OAuthSession } from '@modules/bluesky-oauth'
import { getBlueskyOAuthClient } from '@services/bluesky-accounts'
import { BlueskySessionStore } from '@services/bluesky-accounts/session-store'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { disconnectAcceptedBlueskyAccountAndCleanupFollows } from './disconnect.mts'
import { requestBlueskyDisconnect } from './disconnect-request.mts'
import { getBlueskyFollowReceipt, saveBlueskyFollowReceipt } from './receipts.mts'
import { blueskyFollowsWorkConfig } from './work-limits.mts'

describe('Bluesky disconnect receipt read failures', () => {
  it('preserves the generation and unattempted receipt for retry after a continuation read fails', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 1 }),
    )
    vi.stubEnv('SITE_ORIGIN', 'https://example.voucha.ai')
    onTestFinished(() => {
      vi.unstubAllEnvs()
    })
    const follower = await createTestUserDirect()
    const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    const followees = await Promise.all([createTestUserDirect(), createTestUserDirect()])
    const records = followees
      .map(followee => ({ followee, rkey: createRandomString(13) }))
      .toSorted((left, right) => left.followee.id.localeCompare(right.followee.id))
    for (const { followee, rkey } of records) {
      await saveBlueskyFollowReceipt(
        follower.id,
        followee.id,
        account.bluesky_did,
        account.link_authorization_id,
        `at://${account.bluesky_did}/app.bsky.graph.follow/${rkey}`,
      )
    }
    const attempted: string[] = []
    const session = {
      did: account.bluesky_did,
      fetchHandler: async (_path: string, init: RequestInit) => {
        const body = (await new Response(init.body).json()) as { rkey: string }
        attempted.push(body.rkey)
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      },
    } as unknown as OAuthSession
    const client = await getBlueskyOAuthClient()
    const restore = vi.spyOn(client, 'restore').mockResolvedValue(session)
    const revoke = vi
      .spyOn(client, 'revoke')
      .mockImplementation(async did => new BlueskySessionStore().del(did))
    onTestFinished(() => {
      restore.mockRestore()
      revoke.mockRestore()
    })
    const request = await requestBlueskyDisconnect(follower.id)
    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* listBlueskyFollowReceiptsForFollower */',
      () =>
        disconnectAcceptedBlueskyAccountAndCleanupFollows(follower.id, request).catch(
          (err: unknown) => err,
        ),
      {
        matchesValues: values => values[0] === follower.id && values[3] === records[0]!.followee.id,
      },
    )
    expect(result).toBe(error)
    expect(attempted).toEqual([records[0]!.rkey])
    expect(revoke).not.toHaveBeenCalled()
    expect(await getTestBlueskyLinkedAccountRow(account.bluesky_did)).not.toBeNull()
    expect(
      await getBlueskyFollowReceipt(
        follower.id,
        records[1]!.followee.id,
        account.bluesky_did,
        account.link_authorization_id,
      ),
    ).not.toBeNull()

    await disconnectAcceptedBlueskyAccountAndCleanupFollows(follower.id, request)
    expect(attempted).toEqual(records.map(record => record.rkey))
    expect(await getTestBlueskyLinkedAccountRow(account.bluesky_did)).toBeNull()
  })
})
