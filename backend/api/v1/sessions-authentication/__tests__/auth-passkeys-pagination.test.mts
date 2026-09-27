import { describe } from 'vitest'
import { insertTestPasskey } from '@voucha/test-helpers'
import '../index.mts'
import { registerScopedCredentialPaginationTests } from '../../../../test-helpers/scoped-credential-pagination-tests.mts'

describe('GET /api/v1/auth/passkeys pagination', () => {
  registerScopedCredentialPaginationTests({
    path: '/api/v1/auth/passkeys',
    insert: insertTestPasskey,
    foreignScopePrefix: 'totp',
    tieSuffix: (which, msecs) => `tie-${which}-${msecs}`,
  })
})
