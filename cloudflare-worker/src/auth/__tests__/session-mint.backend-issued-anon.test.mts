import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceTokenPayload, SessionTokenPayload } from '@ts-shared/session-jwt'
import { mintUuidv7 as mintUUIDv7 } from '@vouchington/session-jwt'
import { ensureSession } from '../session-mint.mts'
import type { Env } from '../../types.mts'

const ensureAnonymousSession = vi.fn<VitestLooseMock>()
const dependencies = { ensureAnonymousSession }
const env: Env = {
  VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64: 'some-key-b64',
  VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64: 'some-public-key-b64',
}
const did = mintUUIDv7()
const sessionToken = {
  did,
  sid: mintUUIDv7(),
  uid: null,
} satisfies SessionTokenPayload

describe('backend-issued anonymous sessions through ensureSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureAnonymousSession.mockResolvedValue({
      did: mintUUIDv7(),
      sid: mintUUIDv7(),
      dt: 'minted-dt',
      st: 'minted-st',
      session: { did: mintUUIDv7(), sid: mintUUIDv7(), uid: null },
      mintedDt: true,
      mintedSt: true,
    })
  })

  it('passes through a verified device with an unusable existing session token', async () => {
    const cookies = new Map([
      ['dt', 'irrelevant-dt'],
      ['st', 'irrelevant-st'],
    ])
    const devicePayload: DeviceTokenPayload = { did }

    const result = await ensureSession(cookies, null, devicePayload, null, env, dependencies)

    expect(result).toEqual({ kind: 'anon-passthrough' })
    expect(ensureAnonymousSession).not.toHaveBeenCalled()
  })

  it('re-mints when a session token is present but the device payload did not verify', async () => {
    const cookies = new Map([
      ['dt', 'irrelevant-dt'],
      ['st', 'irrelevant-st'],
    ])

    const result = await ensureSession(cookies, null, null, null, env, dependencies)

    expect(ensureAnonymousSession).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ kind: 'anon-minted', dt: 'minted-dt', st: 'minted-st' })
  })

  it('re-mints a verified device when its session payload is authenticated', async () => {
    const cookies = new Map([
      ['dt', 'irrelevant-dt'],
      ['st', 'irrelevant-st'],
    ])
    const devicePayload: DeviceTokenPayload = { did }
    const authenticatedPayload: SessionTokenPayload = { ...sessionToken, uid: mintUUIDv7() }

    const result = await ensureSession(
      cookies,
      null,
      devicePayload,
      authenticatedPayload,
      env,
      dependencies,
    )

    expect(ensureAnonymousSession).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ kind: 'anon-minted', dt: 'minted-dt', st: 'minted-st' })
  })

  it('re-mints a lone device token that cannot be verified', async () => {
    const result = await ensureSession(
      new Map([['dt', 'not-a-real-token']]),
      null,
      null,
      null,
      env,
      dependencies,
    )

    expect(ensureAnonymousSession).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ kind: 'anon-minted', dt: 'minted-dt', st: 'minted-st' })
  })
})
