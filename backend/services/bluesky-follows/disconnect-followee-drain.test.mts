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
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { hasTestPendingBlueskyDisconnect } from '@voucha/test-helpers/bluesky-disconnect-readers'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import { connectBlueskyAccountToUser, getBlueskyOAuthClient } from '@services/bluesky-accounts'
import { BlueskySessionStore } from '@services/bluesky-accounts/session-store'
import { disconnectAcceptedBlueskyAccountAndCleanupFollows } from './disconnect.mts'
import {
  listPendingBlueskyDisconnectPage,
  requestBlueskyDisconnect,
} from './disconnect-request.mts'
import { saveBlueskyFollowReceipt } from './receipts.mts'
import { blueskyFollowsWorkConfig } from './work-limits.mts'

type Follower = Awaited<ReturnType<typeof followerReceipt>>

async function followerReceipt(followeeId: string) {
  const follower = await createTestUserDirect()
  const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
  await saveBlueskyFollowReceipt(
    follower.id,
    followeeId,
    account.bluesky_did,
    account.link_authorization_id,
    `at://${account.bluesky_did}/app.bsky.graph.follow/${follower.id.slice(0, 13)}`,
  )
  return { id: follower.id, account }
}

async function hasReceipt(follower: Follower, followeeId: string) {
  return Boolean(await getTestBlueskyFollowReceiptRecord(follower.id, followeeId))
}

async function spyOnRevoke() {
  const revoke = vi
    .spyOn(await getBlueskyOAuthClient(), 'revoke')
    .mockImplementation(async did => new BlueskySessionStore().del(did))
  onTestFinished(() => {
    revoke.mockRestore()
  })
  return revoke
}

// Two of the three receipts fill a page of two; the third is a short page that revokes.
async function pendingTarget() {
  onTestFinished(
    overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 2 }),
  )
  const target = await createTestUserDirect()
  const account = await insertTestBlueskyLinkedAccount({ userId: target.id })
  const followers = (
    await Promise.all([
      followerReceipt(target.id),
      followerReceipt(target.id),
      followerReceipt(target.id),
    ])
  ).toSorted((a, b) => a.id.localeCompare(b.id))
  const request = await requestBlueskyDisconnect(target.id)
  return { target, account, followers, request }
}

describe('disconnect cleanup of other followers receipts', () => {
  it('keeps the generation pending after a full page and revokes after a short page', async () => {
    const { target, account, followers, request } = await pendingTarget()
    const revoke = await spyOnRevoke()

    await disconnectAcceptedBlueskyAccountAndCleanupFollows(target.id, request)

    expect(await Promise.all(followers.map(follower => hasReceipt(follower, target.id)))).toEqual([
      false,
      false,
      true,
    ])
    expect(await getTestBlueskyLinkedAccountRow(account.bluesky_did)).not.toBeNull()
    expect(await hasTestPendingBlueskyDisconnect(request)).toBe(true)
    expect(revoke).not.toHaveBeenCalled()
    const after = followers[1]!.id
    const continuation = await backgroundQueue.getJob(
      `disconnect_${target.id}_${account.link_authorization_id}__followee_${after}`,
    )
    expect(continuation?.data).toEqual({ ...request, after })

    await disconnectAcceptedBlueskyAccountAndCleanupFollows(target.id, { ...request, after })

    expect(await hasReceipt(followers[2]!, target.id)).toBe(false)
    expect(revoke).toHaveBeenCalledExactlyOnceWith(account.bluesky_did)
  })

  it('re-drives a lost continuation from the sweep and drains from no cursor', async () => {
    const { target, account, followers, request } = await pendingTarget()
    const revoke = await spyOnRevoke()
    await disconnectAcceptedBlueskyAccountAndCleanupFollows(target.id, request)

    const swept = await listPendingBlueskyDisconnectPage(uuidBefore(request.linkAuthorizationId))
    expect(swept.requests).toContainEqual(request)

    await disconnectAcceptedBlueskyAccountAndCleanupFollows(target.id, request)

    expect(await hasReceipt(followers[2]!, target.id)).toBe(false)
    expect(revoke).toHaveBeenCalledExactlyOnceWith(account.bluesky_did)
  })

  it('rejects relinking the same user while the disconnect is pending', async () => {
    const { target, request } = await pendingTarget()
    await disconnectAcceptedBlueskyAccountAndCleanupFollows(target.id, request)
    const relinkDid = `did:plc:${createRandomString(24)}`
    const relink = await insertTestBlueskyLinkedAccount({
      userId: null,
      did: relinkDid,
      linkingUserId: target.id,
    })

    await expect(
      connectBlueskyAccountToUser(target.id, relinkDid, 'relink.bsky.social', {
        linkAuthorizationId: relink.link_authorization_id,
      }),
    ).rejects.toThrow(/already have a Bluesky account linked/)
  })

  it('continues follower-record deletion by cursor before revoking the exact generation', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, {
        backfill_batch_size: 2,
        disconnect_batch_size: 2,
      }),
    )
    vi.stubEnv('SITE_ORIGIN', 'https://example.voucha.ai')
    onTestFinished(() => {
      vi.unstubAllEnvs()
    })
    const user = await createTestUserDirect()
    const account = await insertTestBlueskyLinkedAccount({ userId: user.id })
    const followees = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const records = followees
      .map(followee => ({
        followee,
        uri: `at://${account.bluesky_did}/app.bsky.graph.follow/${createRandomString(13)}`,
      }))
      .toSorted((a, b) => a.followee.id.localeCompare(b.followee.id))
    for (const { followee, uri } of records) {
      await saveBlueskyFollowReceipt(
        user.id,
        followee.id,
        account.bluesky_did,
        account.link_authorization_id,
        uri,
      )
    }
    const request = await requestBlueskyDisconnect(user.id)
    const replay = createProviderReplay()
    replay.respondWith(
      loadRecordedResponse('bluesky/delete-record-success.http'),
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

    await disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, request)

    const firstPage = records.slice(0, 2)
    expect(replay.requests).toHaveLength(2)
    expect(revoke).not.toHaveBeenCalled()
    expect(await getTestBlueskyLinkedAccountRow(account.bluesky_did)).not.toBeNull()
    expect(
      await Promise.all(
        records.map(({ followee }) => hasReceipt({ id: user.id, account }, followee.id)),
      ),
    ).toEqual([false, false, true])
    const after = firstPage.at(-1)!.followee.id
    const continuation = await backgroundQueue.getJob(
      `disconnect_${user.id}_${account.link_authorization_id}__follower_${after}`,
    )
    expect(continuation?.data).toEqual({ ...request, followerAfter: after })

    await disconnectAcceptedBlueskyAccountAndCleanupFollows(user.id, {
      ...request,
      followerAfter: after,
    })

    expect(replay.requests).toHaveLength(3)
    replay.assertDrained()
    expect(revoke).toHaveBeenCalledExactlyOnceWith(account.bluesky_did)
    expect(await getTestBlueskyLinkedAccountRow(account.bluesky_did)).toBeNull()
    expect(
      await Promise.all(
        records.map(({ followee }) => getTestBlueskyFollowReceiptRecord(user.id, followee.id)),
      ),
    ).toEqual([null, null, null])
  })
})
