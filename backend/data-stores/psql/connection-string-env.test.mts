import { describe, expect, it } from 'vitest'

import * as connectionStringEnv from './connection-string-env.mts'
import { resolveDatabaseConnectionString } from './connection-string-env.mts'

describe('database connection string env resolution', () => {
  it('uses the Vouchington database name for local fallbacks', () => {
    expect(resolveDatabaseConnectionString({})).toBe('postgres://localhost/voucha')
    expect(resolveDatabaseConnectionString({ DOCKER_HOST_IP: 'host.docker.internal' })).toBe(
      'postgres://postgres@host.docker.internal/voucha',
    )
  })

  it('does not re-export platform connection-string assembly', () => {
    expect(connectionStringEnv).not.toHaveProperty('buildDatabaseConnectionStringFromParts')
  })
})
