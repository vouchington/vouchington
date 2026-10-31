import { runWithRequestContext } from '@modules/utils/request-context'
import {
  DEVICE_EXPIRATION_STRING,
  SESSION_EXPIRATION_STRING,
  signDeviceJwt,
  signSessionJwt,
} from '@ts-shared/session-jwt'
import { v7 } from 'uuid'
import { describe, expect, it } from 'vitest'
import { verifyDeviceAndSessionTokens } from './verify.mts'

describe('request-scoped session pair verification', () => {
  it('reuses one signature verification for the same pair inside a request', async () => {
    const { deviceToken, sessionToken } = await anonymousPair()

    await runWithRequestContext(async () => {
      const first = await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })
      const second = await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })

      expect(first).not.toBe(false)
      expect(second).toBe(first)
    })
  })

  it('shares one in-flight verification when the same pair is checked concurrently', async () => {
    const { deviceToken, sessionToken } = await anonymousPair()

    await runWithRequestContext(async () => {
      const [first, second] = await Promise.all([
        verifyDeviceAndSessionTokens({ deviceToken, sessionToken }),
        verifyDeviceAndSessionTokens({ deviceToken, sessionToken }),
      ])

      expect(first).not.toBe(false)
      expect(second).toBe(first)
    })
  })

  it('verifies a different session token in the same request', async () => {
    const did = v7()
    const deviceToken = await signDeviceJwt({ did }, { expiresIn: DEVICE_EXPIRATION_STRING })
    const firstSession = await signSessionJwt(
      { did, sid: v7(), uid: null },
      { expiresIn: SESSION_EXPIRATION_STRING },
    )
    const secondSession = await signSessionJwt(
      { did, sid: v7(), uid: null },
      { expiresIn: SESSION_EXPIRATION_STRING },
    )

    await runWithRequestContext(async () => {
      const first = await verifyDeviceAndSessionTokens({
        deviceToken,
        sessionToken: firstSession,
      })
      const second = await verifyDeviceAndSessionTokens({
        deviceToken,
        sessionToken: secondSession,
      })

      expect(first).not.toBe(false)
      expect(second).not.toBe(false)
      const firstPair = verifiedPair(first)
      const secondPair = verifiedPair(second)
      expect(secondPair).not.toBe(firstPair)
      expect(secondPair.sid).not.toBe(firstPair.sid)
    })
  })

  it('does not treat an invalid pair as the later valid pair', async () => {
    const { deviceToken, sessionToken } = await anonymousPair()

    await runWithRequestContext(async () => {
      await expect(
        verifyDeviceAndSessionTokens({ deviceToken: 'not-a-token', sessionToken: 'not-a-token' }),
      ).resolves.toBe(false)
      const verified = await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })
      expect(verified).not.toBe(false)
    })
  })

  it('verifies the same pair again in a later request', async () => {
    const { deviceToken, sessionToken } = await anonymousPair()
    const first = await runWithRequestContext(() =>
      verifyDeviceAndSessionTokens({ deviceToken, sessionToken }),
    )
    const second = await runWithRequestContext(() =>
      verifyDeviceAndSessionTokens({ deviceToken, sessionToken }),
    )

    expect(first).not.toBe(false)
    expect(second).not.toBe(first)
    expect(second).toEqual(first)
  })

  it('verifies the same pair twice outside a request', async () => {
    const { deviceToken, sessionToken } = await anonymousPair()
    const first = await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })
    const second = await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })

    expect(first).not.toBe(false)
    expect(second).not.toBe(first)
    expect(second).toEqual(first)
  })
})

async function anonymousPair(): Promise<{ deviceToken: string; sessionToken: string }> {
  const did = v7()
  return {
    deviceToken: await signDeviceJwt({ did }, { expiresIn: DEVICE_EXPIRATION_STRING }),
    sessionToken: await signSessionJwt(
      { did, sid: v7(), uid: null },
      { expiresIn: SESSION_EXPIRATION_STRING },
    ),
  }
}

function verifiedPair<T>(result: T | false): T {
  if (result === false) throw new Error('Expected a verified session pair')
  return result
}
