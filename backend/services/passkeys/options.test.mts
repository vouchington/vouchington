import { describe, expect, it } from 'vitest'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server'
import { toPasskeyAuthenticationOptions, toPasskeyRegistrationOptions } from './options.mts'

describe('passkey option DTOs', () => {
  it('preserves supported registration extensions while omitting prf', () => {
    const options: PublicKeyCredentialCreationOptionsJSON = {
      rp: { name: 'Voucha' },
      user: { id: 'user-id', name: 'name', displayName: 'display name' },
      challenge: 'challenge',
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      extensions: {
        appid: 'https://example.com',
        credProps: true,
        hmacCreateSecret: true,
        minPinLength: true,
        prf: { eval: { first: new Uint8Array([1]) } },
      },
    }

    expect(toPasskeyRegistrationOptions(options)).toEqual({
      rp: { name: 'Voucha' },
      user: { id: 'user-id', name: 'name', displayName: 'display name' },
      challenge: 'challenge',
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      extensions: {
        appid: 'https://example.com',
        credProps: true,
        hmacCreateSecret: true,
        minPinLength: true,
      },
    })
  })

  it('preserves supported authentication extensions while omitting prf', () => {
    const options: PublicKeyCredentialRequestOptionsJSON = {
      challenge: 'challenge',
      extensions: {
        appid: 'https://example.com',
        prf: { eval: { first: new Uint8Array([1]) } },
      },
    }

    expect(toPasskeyAuthenticationOptions(options)).toEqual({
      challenge: 'challenge',
      extensions: { appid: 'https://example.com' },
    })
  })

  it('validates credential descriptor enums at the external-library boundary', () => {
    expect(
      toPasskeyAuthenticationOptions({
        challenge: 'challenge',
        allowCredentials: [{ id: 'credential', type: 'public-key', transports: ['usb'] }],
      }),
    ).toMatchObject({
      allowCredentials: [{ id: 'credential', type: 'public-key', transports: ['usb'] }],
    })

    expect(() =>
      toPasskeyAuthenticationOptions({
        challenge: 'challenge',
        allowCredentials: [{ id: 'credential', type: 'future-key' }],
      } as unknown as PublicKeyCredentialRequestOptionsJSON),
    ).toThrow('Unsupported passkey credential type: future-key')
    expect(() =>
      toPasskeyAuthenticationOptions({
        challenge: 'challenge',
        allowCredentials: [{ id: 'credential', type: 'public-key', transports: ['telepathy'] }],
      } as unknown as PublicKeyCredentialRequestOptionsJSON),
    ).toThrow('Unsupported passkey authenticator transport: telepathy')
  })
})
