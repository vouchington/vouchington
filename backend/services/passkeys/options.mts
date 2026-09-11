import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server'
import type {
  PasskeyAuthenticationOptions,
  PasskeyAuthenticatorTransport,
  PasskeyExtensions,
  PasskeyRegistrationOptions,
} from './types.mts'

export function toPasskeyRegistrationOptions(
  options: PublicKeyCredentialCreationOptionsJSON,
): PasskeyRegistrationOptions {
  return {
    rp: copyRelyingParty(options.rp),
    user: copyUser(options.user),
    challenge: options.challenge,
    pubKeyCredParams: options.pubKeyCredParams.map(parameter => ({
      alg: parameter.alg,
      type: toPasskeyCredentialType(parameter.type),
    })),
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.excludeCredentials === undefined
      ? {}
      : { excludeCredentials: copyCredentialDescriptors(options.excludeCredentials) }),
    ...(options.authenticatorSelection === undefined
      ? {}
      : {
          authenticatorSelection: {
            ...(options.authenticatorSelection.authenticatorAttachment === undefined
              ? {}
              : {
                  authenticatorAttachment: options.authenticatorSelection.authenticatorAttachment,
                }),
            ...(options.authenticatorSelection.requireResidentKey === undefined
              ? {}
              : { requireResidentKey: options.authenticatorSelection.requireResidentKey }),
            ...(options.authenticatorSelection.residentKey === undefined
              ? {}
              : { residentKey: options.authenticatorSelection.residentKey }),
            ...(options.authenticatorSelection.userVerification === undefined
              ? {}
              : { userVerification: options.authenticatorSelection.userVerification }),
          },
        }),
    ...(options.hints === undefined ? {} : { hints: [...options.hints] }),
    ...(options.attestation === undefined ? {} : { attestation: options.attestation }),
    ...(options.attestationFormats === undefined
      ? {}
      : { attestationFormats: [...options.attestationFormats] }),
    ...copyExtensions(options.extensions),
  }
}

export function toPasskeyAuthenticationOptions(
  options: PublicKeyCredentialRequestOptionsJSON,
): PasskeyAuthenticationOptions {
  return {
    challenge: options.challenge,
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.rpId === undefined ? {} : { rpId: options.rpId }),
    ...(options.allowCredentials === undefined
      ? {}
      : { allowCredentials: copyCredentialDescriptors(options.allowCredentials) }),
    ...(options.userVerification === undefined
      ? {}
      : { userVerification: options.userVerification }),
    ...(options.hints === undefined ? {} : { hints: [...options.hints] }),
    ...copyExtensions(options.extensions),
  }
}

function copyRelyingParty(
  relyingParty: PublicKeyCredentialCreationOptionsJSON['rp'],
): PasskeyRegistrationOptions['rp'] {
  return {
    name: relyingParty.name,
    ...(relyingParty.id === undefined ? {} : { id: relyingParty.id }),
  }
}

function copyUser(
  user: PublicKeyCredentialCreationOptionsJSON['user'],
): PasskeyRegistrationOptions['user'] {
  return { id: user.id, name: user.name, displayName: user.displayName }
}

function copyCredentialDescriptors(
  descriptors: NonNullable<PublicKeyCredentialRequestOptionsJSON['allowCredentials']>,
): PasskeyAuthenticationOptions['allowCredentials'] {
  return descriptors.map(descriptor => ({
    id: descriptor.id,
    type: toPasskeyCredentialType(descriptor.type),
    ...(descriptor.transports === undefined
      ? {}
      : { transports: descriptor.transports.map(toPasskeyAuthenticatorTransport) }),
  }))
}

function toPasskeyCredentialType(type: string): 'public-key' {
  if (type === 'public-key') return type
  throw new TypeError(`Unsupported passkey credential type: ${type}`)
}

function toPasskeyAuthenticatorTransport(transport: string): PasskeyAuthenticatorTransport {
  if (
    transport === 'ble' ||
    transport === 'cable' ||
    transport === 'hybrid' ||
    transport === 'internal' ||
    transport === 'nfc' ||
    transport === 'smart-card' ||
    transport === 'usb'
  ) {
    return transport
  }
  throw new TypeError(`Unsupported passkey authenticator transport: ${transport}`)
}

function copyExtensions(extensions: PublicKeyCredentialRequestOptionsJSON['extensions']): {
  extensions?: PasskeyExtensions
} {
  if (extensions === undefined) return {}
  return {
    extensions: {
      ...(extensions.appid === undefined ? {} : { appid: extensions.appid }),
      ...(extensions.credProps === undefined ? {} : { credProps: extensions.credProps }),
      ...(extensions.hmacCreateSecret === undefined
        ? {}
        : { hmacCreateSecret: extensions.hmacCreateSecret }),
      ...(extensions.minPinLength === undefined ? {} : { minPinLength: extensions.minPinLength }),
    },
  }
}
