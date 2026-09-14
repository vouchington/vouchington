export type MicrosoftStoreIdKeyKind = 'collections' | 'purchase'

/** Creates a JWT-shaped Store ID key for provider-boundary tests. */
export function createTestMicrosoftStoreIdKey(options: {
  kind: MicrosoftStoreIdKeyKind
  clientId: string
  userId: string
  expiresAt?: Date
  now?: Date
  claimScheme?: 'http' | 'https'
  nonce?: string
}): string {
  const now = options.now ?? new Date()
  const issuedAt = Math.floor(now.getTime() / 1000) - 60
  const expiresAt = options.expiresAt ?? new Date(now.getTime() + 86_400_000)
  const audience = `https://${options.kind}.mp.microsoft.com/v6.0/keys`
  const claim = (name: 'clientId' | 'userId' | 'payload') =>
    `${options.claimScheme ?? 'http'}://schemas.microsoft.com/marketplace/2015/08/claims/key/${name}`
  return [
    encode({ typ: 'JWT', alg: 'RS256', kid: `test-store-id-key-${options.nonce ?? 'default'}` }),
    encode({
      iss: audience,
      aud: audience,
      iat: issuedAt,
      nbf: issuedAt,
      exp: Math.floor(expiresAt.getTime() / 1000),
      [claim('clientId')]: options.clientId,
      [claim('userId')]: options.userId,
      [claim('payload')]: `test-store-id-key-payload-${options.nonce ?? 'default'}`,
    }),
    'test-signature',
  ].join('.')
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}
