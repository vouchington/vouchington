import { createRequire } from 'node:module'

import {
  cruise,
  type ICruiseResult,
  type IForbiddenRuleType,
  type IRegularForbiddenRuleType,
} from 'dependency-cruiser'
import { describe, expect, it } from 'vitest'
import './fixtures/typescript-reachability/header-contract-parser.mts'
import './fixtures/typescript-reachability/header-contract-registry.mts'
import './fixtures/typescript-reachability/type-only-edge.mts'
import './fixtures/typescript-reachability/unrelated-runtime.mts'

const require = createRequire(import.meta.url)

const fixtureRoot = 'backend/dependency-cruiser-rules/__tests__/fixtures/typescript-reachability'

const { noApiFixturesTypescriptReachability } =
  require('../api-fixtures-typescript-reachability.cjs') as {
    noApiFixturesTypescriptReachability: IRegularForbiddenRuleType
  }

function pathNotPatterns(pathNot: string | string[] | undefined): string[] {
  if (!Array.isArray(pathNot)) {
    throw new Error('reachability exemptions must be a list of patterns')
  }
  return pathNot
}

const runtimeConsumerAllowlist: IForbiddenRuleType = {
  ...noApiFixturesTypescriptReachability,
  from: {
    path: `^${fixtureRoot}/`,
    pathNot: [
      `^${fixtureRoot}/header-contract-parser\\.mts$`,
      `^${fixtureRoot}/header-contract-registry\\.mts$`,
    ],
  },
}

async function violationsFor(rule: IForbiddenRuleType, entrypoint: string) {
  const result = await cruise([entrypoint], {
    moduleSystems: ['es6', 'cjs'],
    ruleSet: { forbidden: [rule] },
    tsConfig: { fileName: 'backend/tsconfig.json' },
    tsPreCompilationDeps: true,
    validate: true,
  })
  const cruiseResult = result.output as ICruiseResult
  return cruiseResult.summary.violations.map(({ from, rule: violationRule, to }) => ({
    from,
    rule: violationRule.name,
    to,
  }))
}

describe('no-api-fixtures-typescript-reachability', () => {
  const exemptions = pathNotPatterns(noApiFixturesTypescriptReachability.from.pathNot).map(
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
        pattern.test('backend/test-helpers/api-fixtures/program-paths.mts'),
      ),
    ).toBe(true)
    expect(
      exemptions.some(pattern =>
        pattern.test('backend/test-helpers/api-fixtures/backend-program.probes.test.mts'),
      ),
    ).toBe(true)
    expect(
      exemptions.some(pattern =>
        pattern.test('backend/test-helpers/api-fixtures/backend-row-contracts.mts'),
      ),
    ).toBe(false)
    expect(
      exemptions.some(pattern =>
        pattern.test('backend/test-helpers/api-fixtures/contract-schema.mts'),
      ),
    ).toBe(false)
  })

  it('allowlists exactly the program owner and the two runtime consumers', () => {
    const runtimeConsumers = ['program-paths', 'backend-program.probes.test']
    expect(noApiFixturesTypescriptReachability.from.pathNot).toEqual([
      '^backend/test-helpers/api-fixtures/backend-program\\.mts$',
      `^backend/test-helpers/api-fixtures/(?:${runtimeConsumers.map(name => RegExp.escape(name)).join('|')})\\.mts$`,
    ])
    expect(noApiFixturesTypescriptReachability.to.dependencyTypesNot).toEqual(['type-only'])
  })

  it('ignores a type-only compiler edge', async () => {
    await expect(
      violationsFor(runtimeConsumerAllowlist, `${fixtureRoot}/type-only-edge.mts`),
    ).resolves.toEqual([])
    await expect(
      violationsFor(
        noApiFixturesTypescriptReachability,
        'backend/test-helpers/api-fixtures/contract-schema.mts',
      ),
    ).resolves.toEqual([])
  })

  it('allows only the header-contract parser and registry runtime edges', async () => {
    await expect(
      violationsFor(runtimeConsumerAllowlist, `${fixtureRoot}/header-contract-parser.mts`),
    ).resolves.toEqual([])
    await expect(
      violationsFor(runtimeConsumerAllowlist, `${fixtureRoot}/header-contract-registry.mts`),
    ).resolves.toEqual([])
    const violations = await violationsFor(
      runtimeConsumerAllowlist,
      `${fixtureRoot}/unrelated-runtime.mts`,
    )
    expect(violations).toEqual([
      expect.objectContaining({
        from: `${fixtureRoot}/unrelated-runtime.mts`,
        rule: 'no-api-fixtures-typescript-reachability',
      }),
    ])
  })

  it('keeps the two in-repo runtime consumers and does not exempt the row-contract checker', async () => {
    await expect(
      violationsFor(
        noApiFixturesTypescriptReachability,
        'backend/test-helpers/api-fixtures/program-paths.mts',
      ),
    ).resolves.toEqual([])
    await expect(
      violationsFor(
        noApiFixturesTypescriptReachability,
        'backend/test-helpers/api-fixtures/backend-program.probes.test.mts',
      ),
    ).resolves.toEqual([])
    await expect(
      violationsFor(
        noApiFixturesTypescriptReachability,
        'backend/test-helpers/api-fixtures/backend-row-contracts.mts',
      ),
    ).resolves.toEqual([])
  })

  it('keeps response-contract helpers off the runtime allowlist', async () => {
    for (const file of [
      'backend/test-helpers/api-fixtures/response-contracts.mts',
      'backend/test-helpers/api-fixtures/response-contract-types.mts',
    ]) {
      expect(exemptions.some(pattern => pattern.test(file))).toBe(false)
      await expect(violationsFor(noApiFixturesTypescriptReachability, file)).resolves.toEqual([])
    }
  })
})
