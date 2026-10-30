import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  copyrightReplayDigestCandidates,
  createCopyrightReplayDigest,
} from './replay-identity-hmac.mts'

const ENV = 'VOUCHA_COPYRIGHT_REPLAY_HMAC_KEYS'
const FAKE_OLD = `old:${Buffer.alloc(32, 1).toString('base64')}`
const FAKE_NEW = `new:${Buffer.alloc(32, 2).toString('base64')}`

describe('dedicated copyright replay identities', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('rejects noncanonical material encoding even when it decodes to the right byte length', () => {
    const canonical = Buffer.alloc(32, 1).toString('base64')
    vi.stubEnv(ENV, `ambiguous:${canonical.slice(0, -2)}F=`)
    expect(() => createCopyrightReplayDigest('acknowledgment', 'synthetic request')).toThrow(
      'unique versioned 32-byte keys',
    )
  })
  it('uses the active slot for new identities and retains old-slot exact lookup across rotation', () => {
    vi.stubEnv(ENV, FAKE_OLD)
    const original = createCopyrightReplayDigest(
      'notice-admission',
      'synthetic requester and request key',
    )
    vi.stubEnv(ENV, `${FAKE_NEW},${FAKE_OLD}`)
    expect(
      createCopyrightReplayDigest('notice-admission', 'synthetic requester and request key').keyId,
    ).toBe('new')
    expect(
      copyrightReplayDigestCandidates('notice-admission', 'synthetic requester and request key'),
    ).toContainEqual(original)
    expect(
      createCopyrightReplayDigest('redress-admission', 'synthetic requester and request key')
        .digest,
    ).not.toEqual(original.digest)
  })

  it('fails closed for missing or ambiguous ring configuration without borrowing OTP or encryption secrets', () => {
    vi.stubEnv(ENV, undefined)
    vi.stubEnv('VOUCHA_OTP_TOKEN_HASH_SECRET', 'fake unrelated OTP key')
    expect(() => createCopyrightReplayDigest('acknowledgment', 'synthetic notice')).toThrow(ENV)
    vi.stubEnv(ENV, `${FAKE_OLD},${FAKE_OLD}`)
    expect(() => createCopyrightReplayDigest('acknowledgment', 'synthetic notice')).toThrow(
      'unique versioned',
    )
    vi.stubEnv(ENV, 'invalid:not-base64')
    expect(() => createCopyrightReplayDigest('acknowledgment', 'synthetic notice')).toThrow(
      '32-byte',
    )
  })
})
