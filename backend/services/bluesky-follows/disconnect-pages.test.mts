import { getBlueskyOAuthClient } from '@services/bluesky-accounts'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  getTestBlueskyFollowReceiptRecord,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import { createProviderReplay, loadRecordedResponse } from '@voucha/test-helpers/provider-replay'
import { disconnectAcceptedBlueskyAccountAndCleanupFollows } from './disconnect.mts'
import { requestBlueskyDisconnect } from './disconnect-request.mts'
import { listBlueskyFollowReceiptsForFollower, saveBlueskyFollowReceipt } from './receipts.mts'
import { blueskyFollowsWorkConfig } from './work-limits.mts'

describe('paged Bluesky disconnect', () => {
  it('attempts each remote record once even when a failed receipt remains', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { disconnect_batch_size: 2 }),
    )
    vi.stubEnv('SITE_ORIGIN', 'https://example.voucha.ai')
    onTestFinished(() => {
      vi.unstubAllEnvs()
    })
    const follower = await createTestUserDirect()
    const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    const followees = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const records = followees
      .map(followee => ({
        followee,
        rkey: createRandomString(13),
        uri: '',
      }))
      .toSorted((left, right) => left.followee.id.localeCompare(right.followee.id))
    for (const record of records) {
      record.uri = `at://${account.bluesky_did}/app.bsky.graph.follow/${record.rkey}`
    }
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
      loadRecordedResponse('bluesky/delete-record-unavailable.http'),
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
    // Keep the account after cleanup so the failed and successful local receipts can be inspected.
    const revoke = vi.spyOn(client, 'revoke').mockRejectedValue(new Error('revoke failed'))
    onTestFinished(() => {
      restore.mockRestore()
      revoke.mockRestore()
    })

    const request = await requestBlueskyDisconnect(follower.id)
    expect(
      await listBlueskyFollowReceiptsForFollower(
        follower.id,
        account.bluesky_did,
        account.link_authorization_id,
        null,
      ),
    ).toHaveLength(2)
    await disconnectAcceptedBlueskyAccountAndCleanupFollows(follower.id, request)
    expect(replay.requests).toHaveLength(2)
    expect(revoke).not.toHaveBeenCalled()
    const after = records[1]!.followee.id
    const continuation = await backgroundQueue.getJob(
      `disconnect_${follower.id}_${account.link_authorization_id}__follower_${after}`,
    )
    expect(continuation?.data).toEqual({ ...request, followerAfter: after })
    const remainingReceipts = await Promise.all(
      records.map(({ followee }) => getTestBlueskyFollowReceiptRecord(follower.id, followee.id)),
    )
    expect(remainingReceipts).toEqual([
      expect.objectContaining({ record_uri: records[0]!.uri }),
      null,
      expect.objectContaining({ record_uri: records[2]!.uri }),
    ])

    await expect(
      disconnectAcceptedBlueskyAccountAndCleanupFollows(follower.id, {
        ...request,
        followerAfter: after,
      }),
    ).rejects.toThrow('revoke failed')

    expect(replay.requests).toHaveLength(records.length)
    replay.assertDrained()
    const attemptedRkeys = replay.requests.map(sent => (sent.json() as { rkey: string }).rkey)
    expect(attemptedRkeys.toSorted()).toEqual(records.map(record => record.rkey).toSorted())
    expect(new Set(attemptedRkeys).size).toBe(records.length)
    expect(revoke).toHaveBeenCalledExactlyOnceWith(account.bluesky_did)
    const finalReceipts = await Promise.all(
      records.map(({ followee }) => getTestBlueskyFollowReceiptRecord(follower.id, followee.id)),
    )
    expect(finalReceipts).toEqual([
      expect.objectContaining({ record_uri: records[0]!.uri }),
      null,
      null,
    ])
  })
})
