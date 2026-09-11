import { describe, expect, it, vi } from 'vitest'
import { mintUUIDv7, type DeviceTokenPayload } from '@ts-shared/session-jwt'
import { verifyRequestDeviceIdentity } from './app.mts'

type VerificationDependencies = NonNullable<Parameters<typeof verifyRequestDeviceIdentity>[2]>

describe('request device identity verification', () => {
  it('uses paired verification for edge-anonymous tokens', async () => {
    const did = mintUUIDv7()
    const verifyDevice = vi.fn<(token: string) => Promise<DeviceTokenPayload | null>>()
    const verifyPair = vi.fn<VerificationDependencies['verifyPair']>(async () => ({
      did,
      sid: mintUUIDv7(),
      uid: null,
    }))

    await expect(
      verifyRequestDeviceIdentity('dt', 'st', { verifyDevice, verifyPair }),
    ).resolves.toEqual({ did, dc: undefined })
    expect(verifyDevice).not.toHaveBeenCalled()
  })

  it('falls back to a valid device when the session token is stale', async () => {
    const did = mintUUIDv7()
    const verifyDevice = vi.fn<VerificationDependencies['verifyDevice']>(
      async () => ({ did }) as DeviceTokenPayload,
    )
    const verifyPair = vi.fn<VerificationDependencies['verifyPair']>(async () => false)

    await expect(
      verifyRequestDeviceIdentity('dt', 'stale-st', { verifyDevice, verifyPair }),
    ).resolves.toEqual({ did, dc: undefined })
    expect(verifyDevice).toHaveBeenCalledWith('dt')
  })

  it('returns null when neither a session nor device identity verifies', async () => {
    const verifyDevice = vi.fn<VerificationDependencies['verifyDevice']>(async () => null)
    const verifyPair = vi.fn<VerificationDependencies['verifyPair']>(async () => false)

    await expect(
      verifyRequestDeviceIdentity('dt', undefined, { verifyDevice, verifyPair }),
    ).resolves.toBeNull()
    expect(verifyPair).not.toHaveBeenCalled()
  })
})
