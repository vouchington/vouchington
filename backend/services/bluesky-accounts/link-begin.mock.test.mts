import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  insertTestBlueskyLinkedAccount,
  requestTestBlueskyDisconnect,
} from '@voucha/test-helpers'
import type { NodeOAuthClient } from '@modules/bluesky-oauth'

const beginBlueskyAuthorizationMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const createBlueskyOAuthClientMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('@modules/bluesky-oauth')>(
  import('@modules/bluesky-oauth'),
  async importOriginal => ({
    ...(await importOriginal()),
    beginBlueskyAuthorization: beginBlueskyAuthorizationMock,
    createBlueskyOAuthClient: createBlueskyOAuthClientMock,
  }),
)
createBlueskyOAuthClientMock.mockReturnValue({} as NodeOAuthClient)

import { beginBlueskyAccountLink } from './link-service.mts'
import { connectBlueskyAccountToUser } from './connect.mts'
import { getBlueskyOAuthClient } from './client.mts'

function fakeDid(): string {
  return `did:plc:${createRandomString(24)}`
}

function fakeHandle(): string {
  return `user-${createRandomString(6)}.bsky.social`
}

describe('beginBlueskyAccountLink', () => {
  beforeEach(() => {
    beginBlueskyAuthorizationMock.mockReset()
  })

  it('kicks off authorization with appState carrying only the durable authorization id', async () => {
    const user = await createTestUserDirect()
    const handle = fakeHandle()
    const expectedUrl = new URL('https://bsky.social/oauth/authorize?request_uri=abc')
    beginBlueskyAuthorizationMock.mockResolvedValueOnce(expectedUrl)

    const result = await beginBlueskyAccountLink(user.id, handle)

    expect(result).toEqual({ redirectUrl: expectedUrl })
    const [, , rawState] = beginBlueskyAuthorizationMock.mock.calls[0]!
    expect(await getBlueskyOAuthClient()).toBeDefined()
    expect(JSON.parse(rawState as string)).toEqual({ authorizationId: expect.any(String) })
  })

  it('throws 409 when the user already has a Bluesky account linked', async () => {
    const user = await createTestUserDirect()
    const did = fakeDid()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id, did })
    await connectBlueskyAccountToUser(user.id, did, fakeHandle(), {
      linkAuthorizationId: linked.link_authorization_id,
    })

    await expect(beginBlueskyAccountLink(user.id, fakeHandle())).rejects.toThrow(
      /already have a Bluesky account linked/,
    )
    expect(beginBlueskyAuthorizationMock).not.toHaveBeenCalled()
  })

  it('does not begin a new flow while the previous exact generation is disconnecting', async () => {
    const user = await createTestUserDirect()
    const linked = await insertTestBlueskyLinkedAccount({ userId: user.id })
    await requestTestBlueskyDisconnect(linked.bluesky_did)

    await expect(beginBlueskyAccountLink(user.id, fakeHandle())).rejects.toThrow(
      /still disconnecting/,
    )
    expect(beginBlueskyAuthorizationMock).not.toHaveBeenCalled()
  })
})
