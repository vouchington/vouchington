import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { hasTestPendingBlueskyDisconnect } from '@voucha/test-helpers/bluesky-disconnect-readers'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import { connectBlueskyAccountToUser, getBlueskyOAuthClient } from '@services/bluesky-accounts'
import { disconnectAcceptedBlueskyAccountAndCleanupFollows } from './disconnect.mts'
import {
  listPendingBlueskyDisconnectPage,
  requestBlueskyDisconnect,
} from './disconnect-request.mts'
import { getBlueskyFollowReceipt, saveBlueskyFollowReceipt } from './receipts.mts'
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
  return Boolean(
    await getBlueskyFollowReceipt(
      follower.id,
      followeeId,
      follower.account.bluesky_did,
      follower.account.link_authorization_id,
    ),
  )
}

async function spyOnRevoke() {
  const revoke = vi.spyOn(await getBlueskyOAuthClient(), 'revoke').mockResolvedValue(undefined)
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
      `disconnect_${target.id}_${account.link_authorization_id}__${after}`,
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
})
