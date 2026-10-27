import { describe, expect, it } from 'vitest'
import * as OTPAuth from 'otpauth'
import { createTestUserDirect } from '@voucha/test-helpers'
import { createTotpAuthenticator, verifyTotpSetup, verifyTotpCode } from './index.mts'

const now = 1_800_000_000_000

async function createAuthenticator() {
  const user = await createTestUserDirect()
  const setup = await createTotpAuthenticator(user.id, 'Replay regression')
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(setup.secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  })
  await verifyTotpSetup(
    user.id,
    setup.authenticator.id,
    totp.generate({ timestamp: now - 30_000 }),
    { now: now - 30_000 },
  )
  return { user, totp }
}

describe('TOTP step consumption', () => {
  it('allows exactly one concurrent use and rejects previous steps', async () => {
    const { user, totp } = await createAuthenticator()
    const code = totp.generate({ timestamp: now })
    const results = await Promise.all([
      verifyTotpCode(user.id, code, { now }),
      verifyTotpCode(user.id, code, { now }),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await verifyTotpCode(user.id, code, { now })).toBe(false)
    const oldCode = totp.generate({ timestamp: now - 30_000 })
    expect(await verifyTotpCode(user.id, oldCode, { now })).toBe(false)
    expect(
      await verifyTotpCode(user.id, totp.generate({ timestamp: now + 30_000 }), {
        now: now + 30_000,
      }),
    ).toBe(true)
  })

  it('does not reuse the step consumed during setup', async () => {
    const { user, totp } = await createAuthenticator()
    expect(
      await verifyTotpCode(user.id, totp.generate({ timestamp: now - 30_000 }), {
        now: now - 30_000,
      }),
    ).toBe(false)
  })
})
