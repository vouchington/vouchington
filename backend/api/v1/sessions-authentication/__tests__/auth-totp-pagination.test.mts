import { paginationConfig } from '@services/pagination/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe } from 'vitest'
import { insertTestTotpAuthenticator } from '@voucha/test-helpers'
import '../index.mts'
import { registerScopedCredentialPaginationTests } from '../../../../test-helpers/scoped-credential-pagination-tests.mts'

describe('GET /api/v1/auth/totp pagination', () => {
  registerScopedCredentialPaginationTests({
    configureRuntimeLimits: () =>
      overrideDynamicConfigFieldsForTest(paginationConfig, { default_limit: 10, max_limit: 1 }),
    path: '/api/v1/auth/totp',
    insert: insertTestTotpAuthenticator,
    foreignScopePrefix: 'passkeys',
    tieSuffix: which => `tie-${which}`,
  })
})
