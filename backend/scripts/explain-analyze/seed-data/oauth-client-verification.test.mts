import { describe, expect, it } from 'vitest'
import {
  OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_STRIDE,
  oauthClientVerificationSeedId,
} from './oauth-client-verification.mts'

describe('OAuth client verification EXPLAIN seed', () => {
  it('uses the UUIDv7 hexadecimal suffix selected by the interleaved late-page scenario', () => {
    expect(
      oauthClientVerificationSeedId(OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_STRIDE * 102),
    ).toBe('019e0000-2c00-7000-8000-000000000a5c')
  })
})
