import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  signDeviceJwt,
  verifyDeviceJwt,
  verifySessionJwt,
  DEVICE_EXPIRATION_SECONDS,
  ATTESTED_SESSION_EXPIRATION_SECONDS,
} from '@ts-shared/session-jwt'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { prepareSessionAuthorityForMint } from './dbsc-mint.mts'
import { getWebSessionAuthorityKey } from './dbsc-state.mts'
import { parseSessionMintAuthority } from './dbsc-state-schema.mts'
import { createDeviceAndSessionTokens } from './create.mts'

// The issuing clock is explicit so the fixture can approach expiry without timers.
async function oldNativeAuthority() {
  const user = await createTestUserDirect()
  const [did, sid] = [v7(), v7()]
  const issuedAt = Math.floor(Date.now() / 1000) - DEVICE_EXPIRATION_SECONDS + 60
  await prepareSessionAuthorityForMint({
    uid: user.id,
    did,
    sid,
    binding: { client: 'native' },
    issuedAt,
  })
  const oldToken = await signDeviceJwt(
    { did, client: 'native' },
    {
      issuedAt,
      expiresIn: new Date((issuedAt + DEVICE_EXPIRATION_SECONDS) * 1000),
    },
  )
  return { user, did, sid, issuedAt, oldToken }
}

describe('verified native device renewal', () => {
  it('advances native device expiry and retention after verified attestation while the old device token remains valid', async () => {
    const fixture = await oldNativeAuthority()
    const renewed = await createDeviceAndSessionTokens({
      did: fixture.did,
      sid: fixture.sid,
      uid: fixture.user.id,
      deviceClass: 'attested',
      deviceRenewal: 'verified-native-attestation',
    })
    const [oldDevice, newDevice, access] = await Promise.all([
      verifyDeviceJwt(fixture.oldToken),
      verifyDeviceJwt(renewed.deviceToken.token),
      verifySessionJwt(renewed.sessionToken.token),
    ])
    expect(oldDevice?.exp).toBe(fixture.issuedAt + DEVICE_EXPIRATION_SECONDS)
    expect(newDevice!.exp! - newDevice!.iat!).toBe(DEVICE_EXPIRATION_SECONDS)
    expect(newDevice!.exp!).toBeGreaterThan(oldDevice!.exp!)
    expect(access!.exp! - access!.iat!).toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
    const authority = parseSessionMintAuthority(
      String(await sessionValkeyClient.get(getWebSessionAuthorityKey(fixture.sid))),
    )
    expect(authority).toMatchObject({
      client: 'native',
      deviceIssuedAt: newDevice!.iat,
      deviceExpiresAt: newDevice!.exp,
    })
    expect(await sessionValkeyClient.ttl(getWebSessionAuthorityKey(fixture.sid))).toBeGreaterThan(
      newDevice!.exp! - Math.floor(Date.now() / 1000),
    )
  })

  it('caps secure credential replay at the original native epoch and expiry', async () => {
    const fixture = await oldNativeAuthority()
    const replay = await createDeviceAndSessionTokens({
      did: fixture.did,
      sid: fixture.sid,
      uid: fixture.user.id,
      credentialReplay: true,
      deviceContext: { user_agent: 'Different agent', isNativeClient: false },
    })
    expect(await verifyDeviceJwt(replay.deviceToken.token)).toMatchObject({
      client: 'native',
      iat: fixture.issuedAt,
      exp: fixture.issuedAt + DEVICE_EXPIRATION_SECONDS,
    })
  })

  it('never converts authoritative web identity through the native renewal option', async () => {
    const user = await createTestUserDirect()
    const context = { user_agent: 'Synthetic browser/1.0', origin: 'https://dbsc.example' }
    const web = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      deviceContext: context,
    })
    await expect(
      createDeviceAndSessionTokens({
        did: web.deviceToken.payload.did,
        sid: web.sessionToken.payload.sid,
        uid: user.id,
        deviceClass: 'attested',
        deviceContext: context,
        deviceRenewal: 'verified-native-attestation',
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
    const raw = await sessionValkeyClient.get(
      getWebSessionAuthorityKey(web.sessionToken.payload.sid),
    )
    expect(parseSessionMintAuthority(String(raw)).client).toBe('web')
  })
})
