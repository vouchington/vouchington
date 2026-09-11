import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

interface DependencyCruiserRule {
  from: { pathNot: string[] }
}

const { noApiFixturesTypescriptReachability } =
  require('../api-fixtures-typescript-reachability.cjs') as {
    noApiFixturesTypescriptReachability: DependencyCruiserRule
  }

describe('no-api-fixtures-typescript-reachability', () => {
  const exemptions = noApiFixturesTypescriptReachability.from.pathNot.map(
    pattern => new RegExp(pattern),
  )

  it('does not exempt the former compiler-host construction file', () => {
    expect(
      exemptions.some(pattern =>
        pattern.test('backend/test-helpers/api-fixtures/backend-program-freshness.mts'),
      ),
    ).toBe(false)
  })

  it('retains only the program owner and representative type-guard consumers', () => {
    expect(
      exemptions.some(pattern =>
        pattern.test('backend/test-helpers/api-fixtures/backend-program.mts'),
      ),
    ).toBe(true)
    expect(
      exemptions.some(pattern =>
        pattern.test('backend/test-helpers/api-fixtures/virtual-program.mts'),
      ),
    ).toBe(false)
    expect(
      exemptions.some(pattern =>
        pattern.test('backend/test-helpers/api-fixtures/response-contract-registry.mts'),
      ),
    ).toBe(true)
  })
})
