import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  insertTestBlueskyLinkedAccount,
  insertTestLocalFollow,
} from '@voucha/test-helpers'
import { requestTestBlueskyDisconnect } from '@voucha/test-helpers/entities/bluesky-linked-accounts'
import type { NodeOAuthClient, OAuthSession } from '@modules/bluesky-oauth'

// The PDS HTTP call and OAuth client are the external boundary; everything behind the processors
// runs against the real database and the real Bluesky agent.
const fetchHandler = vi.hoisted(() => vi.fn<VitestLooseMock>())
const revokeBlueskySessionMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('@modules/bluesky-oauth')>(
  import('@modules/bluesky-oauth'),
  async importOriginal => ({
    ...(await importOriginal()),
    revokeBlueskySession: revokeBlueskySessionMock,
    createBlueskyOAuthClient: async () => ({}) as NodeOAuthClient,
    restoreBlueskySession: async (_client: unknown, did: string) =>
      ({ did, fetchHandler }) as unknown as OAuthSession,
  }),
)

import { getBlueskyFollowReceipt } from '@services/bluesky-follows'
import { disconnectRequested, reconcileFollow } from '../processors.mts'

describe('bluesky follow propagation worker processors against the Bluesky boundary', () => {
  it('reconciles a single follower/followee pair', async () => {
    const follower = await createTestUserDirect()
    const followee = await createTestUserDirect()
    const followerAccount = await insertTestBlueskyLinkedAccount({
      userId: follower.id,
      did: `did:plc:${createRandomString(24)}`,
    })
    const followeeAccount = await insertTestBlueskyLinkedAccount({
      userId: followee.id,
      did: `did:plc:${createRandomString(24)}`,
    })
    await insertTestLocalFollow(follower.id, followee.id)
    const recordUri = `at://${followerAccount.bluesky_did}/app.bsky.graph.follow/${createRandomString(13)}`
    fetchHandler.mockResolvedValueOnce(
      Response.json({
        uri: recordUri,
        cid: 'bafyreigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      }),
    )

    await reconcileFollow({ followerUserId: follower.id, followeeUserId: followee.id })

    expect(fetchHandler).toHaveBeenCalledOnce()
    const [path, init] = fetchHandler.mock.calls[0]!
    expect(path).toBe('/xrpc/com.atproto.repo.createRecord')
    expect(JSON.parse(new TextDecoder().decode(init.body))).toMatchObject({
      repo: followerAccount.bluesky_did,
      collection: 'app.bsky.graph.follow',
      record: { subject: followeeAccount.bluesky_did },
    })
    const receipt = await getBlueskyFollowReceipt(
      follower.id,
      followee.id,
      followerAccount.bluesky_did,
      followerAccount.link_authorization_id,
    )
    expect(receipt?.record_uri).toBe(recordUri)
  })

  it('disconnects only the exact generation carried by the durable job', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({
      userId: user.id,
      did: `did:plc:${createRandomString(24)}`,
    })
    const data = {
      userId: user.id,
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
    }
    await requestTestBlueskyDisconnect(linked.bluesky_did)

    await disconnectRequested({ ...data, linkAuthorizationId: randomUUID() })
    expect(revokeBlueskySessionMock).not.toHaveBeenCalled()

    await disconnectRequested(data)

    expect(revokeBlueskySessionMock).toHaveBeenCalledExactlyOnceWith({}, linked.bluesky_did)
  })
})
