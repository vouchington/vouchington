export type PublicTotpAuthenticator = {
  id: string
  name: string
  created_at: Date
}

export type TotpSetupData = {
  authenticator: PublicTotpAuthenticator
  secret: string // base32 - shown to user during setup only
  uri: string // otpauth:// URI for QR code
}
