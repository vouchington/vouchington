import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encryptSecret } from '@modules/token-secrets'
import {
  decryptOAuthAuthorizationCode,
  decryptOAuthAuthorizationPkceVerifier,
} from '../authorization-broker.mts'

describe('OAuth authorization encrypted secrets', () => {
  it('decrypts callback and PKCE secrets under their flow-bound purposes', () => {
    const flowId = randomUUID()
    const code = 'provider-code'
    const verifier = 'provider-verifier'

    expect(
      decryptOAuthAuthorizationCode(
        flowId,
        encryptSecret(code, `oauth-authorization-broker:${flowId}:callback-code`),
      ),
    ).toBe(code)
    expect(
      decryptOAuthAuthorizationPkceVerifier(
        flowId,
        encryptSecret(verifier, `oauth-authorization-broker:${flowId}:pkce-verifier`),
      ),
    ).toBe(verifier)
  })
})
