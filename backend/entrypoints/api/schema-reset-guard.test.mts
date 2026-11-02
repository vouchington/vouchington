import { describe, expect, it } from 'vitest'
import { assertStagingSchemaResetAllowed } from './schema-reset-guard.mts'

describe('assertStagingSchemaResetAllowed', () => {
  it('allows staging with the explicit opt-in', () => {
    expect(() =>
      assertStagingSchemaResetAllowed({
        ENVIRONMENT: 'staging',
        ALLOW_STAGING_SCHEMA_RESET: 'true',
      }),
    ).not.toThrow()
  })

  it.each([
    [
      'production with the opt-in',
      { ENVIRONMENT: 'production', ALLOW_STAGING_SCHEMA_RESET: 'true' },
    ],
    ['staging without the opt-in', { ENVIRONMENT: 'staging' }],
    ['staging with a non-true opt-in', { ENVIRONMENT: 'staging', ALLOW_STAGING_SCHEMA_RESET: '1' }],
    ['an unset environment', { ALLOW_STAGING_SCHEMA_RESET: 'true' }],
  ])('rejects %s', (_name, env) => {
    expect(() => assertStagingSchemaResetAllowed(env)).toThrow('staging reset guard')
  })
})
