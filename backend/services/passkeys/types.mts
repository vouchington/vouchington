export type PublicPasskey = {
  id: string
  name: string
  device_type: 'singleDevice' | 'multiDevice'
  backed_up: boolean
  created_at: Date
  last_used_at: Date | null
}

export type PasskeyExtensions = {
  appid?: string
  credProps?: boolean
  hmacCreateSecret?: boolean
  minPinLength?: boolean
}

type PasskeyCredentialDescriptor = {
  id: string
  transports?: PasskeyAuthenticatorTransport[]
  type: 'public-key'
}

export type PasskeyAuthenticatorTransport =
  | 'ble'
  | 'cable'
  | 'hybrid'
  | 'internal'
  | 'nfc'
  | 'smart-card'
  | 'usb'

type PasskeyAuthenticatorSelection = {
  authenticatorAttachment?: 'cross-platform' | 'platform'
  requireResidentKey?: boolean
  residentKey?: 'discouraged' | 'preferred' | 'required'
  userVerification?: 'discouraged' | 'preferred' | 'required'
}

export type PasskeyAuthenticationOptions = {
  allowCredentials?: PasskeyCredentialDescriptor[]
  challenge: string
  extensions?: PasskeyExtensions
  hints?: ('client-device' | 'hybrid' | 'security-key')[]
  rpId?: string
  timeout?: number
  userVerification?: 'discouraged' | 'preferred' | 'required'
}

export type PasskeyRegistrationOptions = {
  attestation?: 'direct' | 'enterprise' | 'indirect' | 'none'
  attestationFormats?: (
    | 'android-key'
    | 'android-safetynet'
    | 'apple'
    | 'fido-u2f'
    | 'none'
    | 'packed'
    | 'tpm'
  )[]
  authenticatorSelection?: PasskeyAuthenticatorSelection
  challenge: string
  excludeCredentials?: PasskeyCredentialDescriptor[]
  extensions?: PasskeyExtensions
  hints?: ('client-device' | 'hybrid' | 'security-key')[]
  pubKeyCredParams: { alg: number; type: 'public-key' }[]
  rp: { id?: string; name: string }
  timeout?: number
  user: { displayName: string; id: string; name: string }
}
