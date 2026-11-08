import { getBlueskyOAuthClient } from '@services/bluesky-accounts'
import { BlueskySessionStore } from '@services/bluesky-accounts/session-store'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  getTestBlueskyFollowReceiptRecord,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createProviderReplay, loadRecordedResponse } from '@voucha/test-helpers/provider-replay'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { disconnectAcceptedBlueskyAccountAndCleanupFollows } from './disconnect.mts'
import { requestBlueskyDisconnect } from './disconnect-request.mts'
import { saveBlueskyFollowReceipt } from './receipts.mts'
import { blueskyFollowsWorkConfig } from './work-limits.mts'

describe('Bluesky disconnect receipt read failures', () => {
  it('preserves the generation and unattempted receipt for retry after a continuation read fails', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, {
        backfill_batch_size: 1,
        disconnect_batch_size: 1,
      }),
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
    const replay = createProviderReplay()
    replay.respondWith(
      loadRecordedResponse('bluesky/delete-record-success.http'),
      loadRecordedResponse('bluesky/delete-record-success.http'),
    )
    const session = {
      did: account.bluesky_did,
      fetchHandler: (url: string, init?: RequestInit) =>
        replay.sendHttpRequest(new URL(url, 'https://bsky.social').href, init),
    } as unknown as import('@modules/bluesky-oauth').OAuthSession
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
    await disconnectAcceptedBlueskyAccountAndCleanupFollows(follower.id, request)
    expect(replay.requests).toHaveLength(1)
    expect(revoke).not.toHaveBeenCalled()
    const continuation = { ...request, followerAfter: records[0]!.followee.id }
    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* listBlueskyFollowReceiptsForFollower */',
      () =>
        disconnectAcceptedBlueskyAccountAndCleanupFollows(follower.id, continuation).catch(
          (err: unknown) => err,
        ),
      {
        matchesValues: values => values[0] === follower.id && values[4] === records[0]!.followee.id,
      },
    )
    expect(result).toBe(error)
    expect(replay.requests).toHaveLength(1)
    expect(revoke).not.toHaveBeenCalled()
    expect(await getTestBlueskyLinkedAccountRow(account.bluesky_did)).not.toBeNull()
    expect(
      await getTestBlueskyFollowReceiptRecord(follower.id, records[1]!.followee.id),
    ).not.toBeNull()

    await disconnectAcceptedBlueskyAccountAndCleanupFollows(follower.id, continuation)
    expect(replay.requests).toHaveLength(2)
    replay.assertDrained()
    expect(await getTestBlueskyLinkedAccountRow(account.bluesky_did)).not.toBeNull()
    await disconnectAcceptedBlueskyAccountAndCleanupFollows(follower.id, {
      ...request,
      followerAfter: records[1]!.followee.id,
    })
    expect(replay.requests).toHaveLength(2)
    expect(await getTestBlueskyLinkedAccountRow(account.bluesky_did)).toBeNull()
  })

  it('keeps an exact receipt and generation retryable when the local batch delete fails', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { disconnect_batch_size: 2 }),
    )
    vi.stubEnv('SITE_ORIGIN', 'https://example.voucha.ai')
    onTestFinished(() => {
      vi.unstubAllEnvs()
    })
    const follower = await createTestUserDirect()
    const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    const followee = await createTestUserDirect()
    const recordUri = `at://${account.bluesky_did}/app.bsky.graph.follow/${createRandomString(13)}`
    await saveBlueskyFollowReceipt(
      follower.id,
      followee.id,
      account.bluesky_did,
      account.link_authorization_id,
      recordUri,
    )
    const replay = createProviderReplay()
    replay.respondWith(
      loadRecordedResponse('bluesky/delete-record-success.http'),
      loadRecordedResponse('bluesky/delete-record-success.http'),
    )
    const session = {
      did: account.bluesky_did,
      fetchHandler: (url: string, init?: RequestInit) =>
        replay.sendHttpRequest(new URL(url, 'https://bsky.social').href, init),
    } as unknown as import('@modules/bluesky-oauth').OAuthSession
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
      '/* deleteBlueskyFollowReceipts */',
      () =>
        disconnectAcceptedBlueskyAccountAndCleanupFollows(follower.id, request).catch(
          (err: unknown) => err,
        ),
      {
        command: 'DELETE',
        matchesValues: values =>
          values.includes(follower.id) &&
          values.some(value => Array.isArray(value) && value.includes(recordUri)),
      },
    )

    expect(result).toBe(error)
    expect(replay.requests).toHaveLength(1)
    expect(revoke).not.toHaveBeenCalled()
    expect(await getTestBlueskyLinkedAccountRow(account.bluesky_did)).not.toBeNull()
    expect(await getTestBlueskyFollowReceiptRecord(follower.id, followee.id)).toEqual({
      record_uri: recordUri,
      follower_account_link_authorization_id: account.link_authorization_id,
    })

    await disconnectAcceptedBlueskyAccountAndCleanupFollows(follower.id, request)

    expect(replay.requests).toHaveLength(2)
    replay.assertDrained()
    expect(revoke).toHaveBeenCalledExactlyOnceWith(account.bluesky_did)
    expect(await getTestBlueskyLinkedAccountRow(account.bluesky_did)).toBeNull()
    expect(await getTestBlueskyFollowReceiptRecord(follower.id, followee.id)).toBeNull()
  })
})
