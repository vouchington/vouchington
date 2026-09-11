import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mintUUIDv7,
  type DeviceTokenPayload,
  type SessionTokenPayload,
} from '@ts-shared/session-jwt'
import type { SessionCachePayload } from '../jwt.mts'
import { createSignedDeviceJwt } from '../test-jwt-fixtures.mts'
import type { Env } from '../../types.mts'

const mockEnsureAnonymousSession = vi.fn<VitestLooseMock>()
const DEPS = { ensureAnonymousSession: mockEnsureAnonymousSession }

import { ensureSession } from '../session-mint.mts'

const BASE_ENV: Env = {
  VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64: 'some-key-b64',
  VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64: 'some-public-key-b64',
}

const ANON_DID = mintUUIDv7()
const ANON_SID = mintUUIDv7()

const ANON_MINT_RESULT = {
  did: ANON_DID,
  sid: ANON_SID,
  dt: 'minted-dt',
  st: 'minted-st',
  session: { did: ANON_DID, sid: ANON_SID, uid: null },
  mintedDt: true,
  mintedSt: true,
}

describe('ensureSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureAnonymousSession.mockResolvedValue(ANON_MINT_RESULT)
  })

  it('returns authenticated when cachePayload has uid', async () => {
    const uid = mintUUIDv7()
    const cachePayload: SessionCachePayload = { uid }
    const result = await ensureSession(new Map(), cachePayload, null, null, BASE_ENV, DEPS)
    expect(result).toEqual({ kind: 'authenticated', uid })
    expect(mockEnsureAnonymousSession).not.toHaveBeenCalled()
  })

  it('returns unavailable when private key env is absent in production', async () => {
    const env: Env = { PRODUCTION: 'true' }
    const result = await ensureSession(new Map(), null, null, null, env, DEPS)
    expect(result).toEqual({ kind: 'unavailable' })
    expect(mockEnsureAnonymousSession).not.toHaveBeenCalled()
  })

  it('returns unavailable in production when only edge private key is configured', async () => {
    const env: Env = {
      PRODUCTION: 'true',
      VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64: 'edge-key-b64',
    }

    const result = await ensureSession(new Map(), null, null, null, env, DEPS)

    expect(result).toEqual({ kind: 'unavailable' })
    expect(mockEnsureAnonymousSession).not.toHaveBeenCalled()
  })

  it('returns unavailable in deployed non-production when edge keys are absent', async () => {
    const env: Env = { PRODUCTION: 'false' }
    const result = await ensureSession(new Map(), null, null, null, env, DEPS)
    expect(result).toEqual({ kind: 'unavailable' })
    expect(mockEnsureAnonymousSession).not.toHaveBeenCalled()
  })

  it('returns unavailable when deployed non-production has malformed local origin config', async () => {
    const env: Env = { PRODUCTION: 'false', WEB_ORIGIN: 'not-a-url' }
    const result = await ensureSession(new Map(), null, null, null, env, DEPS)
    expect(result).toEqual({ kind: 'unavailable' })
    expect(mockEnsureAnonymousSession).not.toHaveBeenCalled()
  })

  it('preserves local dev fallback minting when PRODUCTION=false', async () => {
    const env: Env = { PRODUCTION: 'false', WEB_ORIGIN: 'http://localhost:3000' }
    const result = await ensureSession(new Map(), null, null, null, env, DEPS)
    expect(mockEnsureAnonymousSession).toHaveBeenCalled()
    expect(result).toEqual({
      kind: 'anon-minted',
      dt: 'minted-dt',
      st: 'minted-st',
      mintedDt: true,
      mintedSt: true,
    })
  })

  it('calls ensureAnonymousSession when key is absent in development', async () => {
    const env: Env = {}
    const result = await ensureSession(new Map(), null, null, null, env, DEPS)
    expect(mockEnsureAnonymousSession).toHaveBeenCalled()
    expect(result).toEqual({
      kind: 'anon-minted',
      dt: 'minted-dt',
      st: 'minted-st',
      mintedDt: true,
      mintedSt: true,
    })
  })

  it('returns anon-minted when tokens are freshly minted', async () => {
    const result = await ensureSession(new Map(), null, null, null, BASE_ENV, DEPS)
    expect(result).toEqual({
      kind: 'anon-minted',
      dt: 'minted-dt',
      st: 'minted-st',
      mintedDt: true,
      mintedSt: true,
    })
  })

  it('returns anon-passthrough when existing anon cookies are valid but did not verify as backend-issued', async () => {
    mockEnsureAnonymousSession.mockResolvedValue({
      ...ANON_MINT_RESULT,
      mintedDt: false,
      mintedSt: false,
    })
    const cookies = new Map([
      ['dt', 'existing-dt'],
      ['st', 'existing-st'],
    ])
    const result = await ensureSession(cookies, null, null, null, BASE_ENV, DEPS)
    expect(result).toEqual({ kind: 'anon-passthrough' })
  })

  it('returns anon-passthrough for a backend-issued anon session without calling ensureAnonymousSession', async () => {
    const did = mintUUIDv7()
    const devicePayload: DeviceTokenPayload = { did }
    const sessionPayload: SessionTokenPayload = { did, uid: null, sid: mintUUIDv7() }
    const cookies = new Map([
      ['dt', 'irrelevant-dt'],
      ['st', 'irrelevant-st'],
    ])

    const result = await ensureSession(cookies, null, devicePayload, sessionPayload, BASE_ENV, DEPS)

    expect(result).toEqual({ kind: 'anon-passthrough' })
    expect(mockEnsureAnonymousSession).not.toHaveBeenCalled()
  })

  it('returns anon-passthrough for an attested backend-issued device payload (dc preserved upstream, not re-minted)', async () => {
    const did = mintUUIDv7()
    const devicePayload: DeviceTokenPayload = { did, dc: 'attested' }
    const sessionPayload: SessionTokenPayload = { did, uid: null, sid: mintUUIDv7() }
    const cookies = new Map([
      ['dt', 'irrelevant-dt'],
      ['st', 'irrelevant-st'],
    ])

    const result = await ensureSession(cookies, null, devicePayload, sessionPayload, BASE_ENV, DEPS)

    expect(result).toEqual({ kind: 'anon-passthrough' })
    expect(mockEnsureAnonymousSession).not.toHaveBeenCalled()
  })

  it('returns anon-passthrough for a backend-issued dt when sessionPayload is null (st missing/unusable)', async () => {
    // No st cookie, so this dt is independently re-verified by isBackendIssuedAnonSession — needs
    // a real signed token, unlike the dt+st cases below where the pre-verified payloads are reused.
    const did = mintUUIDv7()
    const deviceToken = await createSignedDeviceJwt({ did })
    const devicePayload: DeviceTokenPayload = { did }
    const cookies = new Map([['dt', deviceToken]])

    const result = await ensureSession(cookies, null, devicePayload, null, BASE_ENV, DEPS)

    expect(result).toEqual({ kind: 'anon-passthrough' })
    expect(mockEnsureAnonymousSession).not.toHaveBeenCalled()
  })

  it('falls through to ensureAnonymousSession when did does not match between dt and st', async () => {
    const devicePayload: DeviceTokenPayload = { did: mintUUIDv7() }
    const sessionPayload: SessionTokenPayload = { did: mintUUIDv7(), uid: null, sid: mintUUIDv7() }
    const cookies = new Map([
      ['dt', 'irrelevant-dt'],
      ['st', 'irrelevant-st'],
    ])

    const result = await ensureSession(cookies, null, devicePayload, sessionPayload, BASE_ENV, DEPS)

    expect(mockEnsureAnonymousSession).toHaveBeenCalled()
    expect(result).toEqual({
      kind: 'anon-minted',
      dt: 'minted-dt',
      st: 'minted-st',
      mintedDt: true,
      mintedSt: true,
    })
  })

  it('falls through to ensureAnonymousSession when devicePayload is null (no dt, or dt failed verification)', async () => {
    const cookies = new Map([['st', 'irrelevant-st']])

    const result = await ensureSession(cookies, null, null, null, BASE_ENV, DEPS)

    expect(mockEnsureAnonymousSession).toHaveBeenCalled()
    expect(result).toEqual({
      kind: 'anon-minted',
      dt: 'minted-dt',
      st: 'minted-st',
      mintedDt: true,
      mintedSt: true,
    })
  })

  it('passes cookies to ensureAnonymousSession', async () => {
    const cookies = new Map([
      ['dt', 'my-dt'],
      ['st', 'my-st'],
    ])
    await ensureSession(cookies, null, null, null, BASE_ENV, DEPS)
    expect(mockEnsureAnonymousSession).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceToken: 'my-dt',
        sessionToken: 'my-st',
        issuer: 'voucha.ai:edge-anon',
        env: expect.objectContaining({
          VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: 'some-key-b64',
        }),
      }),
    )
  })

  it('uses production mode when PRODUCTION=true', async () => {
    const env: Env = { ...BASE_ENV, PRODUCTION: 'true' }
    await ensureSession(new Map(), null, null, null, env, DEPS)
    expect(mockEnsureAnonymousSession).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'production' }),
    )
  })

  it('uses development mode when PRODUCTION is not set', async () => {
    await ensureSession(new Map(), null, null, null, BASE_ENV, DEPS)
    expect(mockEnsureAnonymousSession).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'development' }),
    )
  })
})
