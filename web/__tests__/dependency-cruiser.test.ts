import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

interface ForbiddenRule {
  name: string
  severity: string
  from: { path: string; pathNot?: string[] }
  to: { path: string }
}

interface DependencyCruiserConfig {
  forbidden: ForbiddenRule[]
}

// Loads the real web/.dependency-cruiser.cjs config rather than duplicating its regexes here, so
// a future edit to the rule can't silently drift from what `pnpm run dep-cruise:web` actually
// enforces.
const config = require('../.dependency-cruiser.cjs') as DependencyCruiserConfig
const deployEnvironmentRule = config.forbidden.find(
  entry => entry.name === 'web-no-deploy-environment-import',
)
const requestClientRule = config.forbidden.find(
  entry => entry.name === 'web-api-no-direct-request-clients',
)

describe('web-no-deploy-environment-import', () => {
  it('is registered as an error-severity forbidden rule', () => {
    expect(deployEnvironmentRule).toBeDefined()
    expect(deployEnvironmentRule?.severity).toBe('error')
  })

  it('matches web/** source files on the from side', () => {
    expect(new RegExp(deployEnvironmentRule!.from.path).test('web/lib/utils/image-origin.ts')).toBe(
      true,
    )
    expect(new RegExp(deployEnvironmentRule!.from.path).test('backend/modules/aws/ses.mts')).toBe(
      false,
    )
  })

  it('matches @ts-shared/deploy-environment on the to side, and no other ts-shared package', () => {
    expect(
      new RegExp(deployEnvironmentRule!.to.path).test('ts-shared/deploy-environment/index.mts'),
    ).toBe(true)
    expect(
      new RegExp(deployEnvironmentRule!.to.path).test('ts-shared/feature-flags/index.mts'),
    ).toBe(false)
  })
})

describe('web-api-no-direct-request-clients', () => {
  it('keeps raw clients inside API owners, including first-layer API test helpers', () => {
    expect(requestClientRule?.severity).toBe('error')
    expect(requestClientRule?.from.pathNot).toEqual(['^web/lib/api/', '^web/test-helpers/lib/api/'])
  })
})
