import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertVertexEnvironment } from './vertex.mts'

const REQUIRED = [
  'VERTEX_PROJECT_ID',
  'VERTEX_PROJECT_NUMBER',
  'VERTEX_BATCH_BUCKET',
  'VERTEX_WIF_POOL_ID',
  'VERTEX_WIF_PROVIDER_ID',
  'VERTEX_SERVICE_ACCOUNT_EMAIL',
]

function stubCompleteEnvironment(): void {
  vi.stubEnv('VERTEX_LOCATION', 'us')
  for (const name of REQUIRED) vi.stubEnv(name, 'synthetic')
}

describe('assertVertexEnvironment', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('accepts a complete configuration', () => {
    stubCompleteEnvironment()
    expect(() => assertVertexEnvironment()).not.toThrow()
  })

  it.each(['VERTEX_LOCATION', ...REQUIRED])('rejects a missing %s', name => {
    stubCompleteEnvironment()
    vi.stubEnv(name, '')
    expect(() => assertVertexEnvironment()).toThrow(name)
  })

  it('rejects a non-us location', () => {
    stubCompleteEnvironment()
    vi.stubEnv('VERTEX_LOCATION', 'eu')
    expect(() => assertVertexEnvironment()).toThrow('VERTEX_LOCATION must be us')
  })
})
