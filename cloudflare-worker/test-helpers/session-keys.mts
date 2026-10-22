import { derivePublicJwk, encodeJwkSetForEnv } from '@ts-shared/session-jwt'
import testPrivateKey from '@ts-shared/session-jwt/test-jwt-private-key'

const privateKeys = encodeJwkSetForEnv([testPrivateKey])
const publicKeys = encodeJwkSetForEnv([derivePublicJwk(testPrivateKey)])

export const configuredSessionKeys = {
  VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: publicKeys,
  VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64: privateKeys,
  VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64: publicKeys,
}
