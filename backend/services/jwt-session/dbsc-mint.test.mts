import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { prepareSessionAuthorityForMint } from './dbsc-mint.mts'
import { getWebSessionAuthorityKey } from './dbsc-state.mts'
import { revokeSessionKey, revokeUserSessionsBefore } from './session-revocation-keys.mts'

describe('initial session mint authority', () => {
  it.each(['session', 'user'] as const)(
    'does not initialize when %s revocation linearizes after the mint epoch is selected',
    async revocation => {
      const user = await createTestUserDirect()
      const sid = v7()
      const issuedAt = Math.floor(Date.now() / 1000)
      if (revocation === 'session') await revokeSessionKey(sid)
      else await revokeUserSessionsBefore(user.id, issuedAt)
      await expect(
        prepareSessionAuthorityForMint({
          uid: user.id,
          did: v7(),
          sid,
          binding: { client: 'native' },
          issuedAt,
        }),
      ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
      expect(await sessionValkeyClient.get(getWebSessionAuthorityKey(sid))).toBeNull()
    },
  )
})
