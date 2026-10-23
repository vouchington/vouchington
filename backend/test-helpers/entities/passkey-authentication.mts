import assert from 'node:assert/strict'
import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto'
import { read, write } from '@data-stores/psql'

/** A synthetic P-256 authenticator exercises the real WebAuthn verifier without a browser. */
export async function createTestPasskeyAuthenticator(
  currentUserId: string,
  relyingPartyId: string,
  origin: string,
) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = publicKey.export({ format: 'jwk' })
  assert(jwk.x && jwk.y)
  // COSE EC2/P-256/ES256 map: {1:2,3:-7,-1:1,-2:x,-3:y}.
  const coseKey = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(jwk.y, 'base64url'),
  ])
  const credentialId = randomBytes(32).toString('base64url')
  const { rows } = await write<{ id: string }>(
    `/* createTestPasskeyAuthenticator */ INSERT INTO user_passkeys
     (user_id, credential_id, public_key, counter, device_type, is_backed_up, name)
     VALUES ($1, $2, $3, 0, 'singleDevice', FALSE, 'Synthetic authenticator') RETURNING id`,
    [currentUserId, credentialId, coseKey],
  )
  return {
    passkeyId: rows[0].id,
    credentialId,
    createAssertion(
      challenge: string,
      options: {
        origin?: string
        userHandle?: string | null
        userVerified?: boolean
        counter?: number
      } = {},
    ) {
      const clientData = Buffer.from(
        JSON.stringify({
          type: 'webauthn.get',
          challenge,
          origin: options.origin ?? origin,
          crossOrigin: false,
        }),
      )
      const authenticatorData = Buffer.alloc(37)
      createHash('sha256').update(relyingPartyId).digest().copy(authenticatorData)
      authenticatorData[32] = options.userVerified ? 0x05 : 0x01
      authenticatorData.writeUInt32BE(options.counter ?? 1, 33)
      const signature = createSign('SHA256')
        .update(
          Buffer.concat([authenticatorData, createHash('sha256').update(clientData).digest()]),
        )
        .sign(privateKey)
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          authenticatorData: authenticatorData.toString('base64url'),
          clientDataJSON: clientData.toString('base64url'),
          signature: signature.toString('base64url'),
          userHandle:
            options.userHandle === undefined
              ? Buffer.from(currentUserId).toString('base64url')
              : options.userHandle,
        },
      }
    },
  }
}

export async function getTestPasskeyCounter(passkeyId: string): Promise<number | null> {
  const { rows } = await read<{ counter: number | string }>(
    '/* getTestPasskeyCounter */ SELECT counter FROM user_passkeys WHERE id = $1',
    [passkeyId],
  )
  return rows[0] ? Number(rows[0].counter) : null
}
