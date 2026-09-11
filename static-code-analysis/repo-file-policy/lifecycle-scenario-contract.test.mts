import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  LIFECYCLE_ADAPTERS,
  LIFECYCLE_FAMILY_CONSUMERS,
  validateLifecycleScenarioContract,
} from './lifecycle-scenario-contract.mts'

describe('lifecycle scenario contract', () => {
  const roots: string[] = []
  const schemaContent = readFileSync(
    new URL('../../api-fixtures/v1/lifecycle-scenarios.schema.json', import.meta.url),
    'utf8',
  )

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
  })

  function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      $schema: './lifecycle-scenarios.schema.json',
      version: 1,
      scenarios: [
        {
          id: 'integrity-report-resolution-exact-read-authoritative',
          family: 'integrity-authoritative-read',
          requiredConsumers: ['backend'],
          input: {
            preconditions: { reportStatus: 'pending' },
            action: { type: 'resolve-report' },
            serverOutcome: { exactReadStatus: 'resolved' },
          },
          expected: {
            visibleState: { reportStatus: 'resolved' },
            availableActions: [],
            reconciliation: { strategy: 'exact-read' },
            cancellation: { behavior: 'not-applicable' },
          },
          backendExpected: {
            visibleState: { reportStatus: 'resolved' },
            availableActions: [],
            reconciliation: { strategy: 'exact-read' },
            cancellation: { behavior: 'not-applicable' },
          },
        },
      ],
      claims: [
        {
          scenarioId: 'integrity-report-resolution-exact-read-authoritative',
          consumer: 'backend',
          adapter: 'backend-integrity-authority',
        },
      ],
      ...overrides,
    }
  }

  function run(
    contract: Record<string, unknown>,
    schema = schemaContent,
    mutateEvidence?: (root: string) => void,
  ): string[] {
    const root = mkdtempSync(join(tmpdir(), 'voucha-lifecycle-contract-'))
    roots.push(root)
    const schemaPath = join(root, 'api-fixtures/v1/lifecycle-scenarios.schema.json')
    mkdirSync(dirname(schemaPath), { recursive: true })
    writeFileSync(schemaPath, schema)
    const evidenceContents = new Map<string, string[]>()
    for (const [name, adapter] of Object.entries(LIFECYCLE_ADAPTERS)) {
      for (const evidence of Object.values(adapter.evidence)) {
        const path = join(root, evidence)
        mkdirSync(dirname(path), { recursive: true })
      }
      evidenceContents.set(adapter.evidence.manifest, [
        ...(evidenceContents.get(adapter.evidence.manifest) ?? []),
        'lifecycle-scenarios.json',
      ])
      evidenceContents.set(adapter.evidence.dispatch, [
        ...(evidenceContents.get(adapter.evidence.dispatch) ?? []),
        name,
      ])
    }
    for (const [path, contents] of evidenceContents) {
      writeFileSync(join(root, path), contents.join('\n'))
    }
    mutateEvidence?.(root)
    const tracked = [
      'api-fixtures/v1/lifecycle-scenarios.schema.json',
      ...Object.values(LIFECYCLE_ADAPTERS).flatMap(adapter => Object.values(adapter.evidence)),
    ]
    return validateLifecycleScenarioContract(JSON.stringify(contract), root, tracked)
  }

  it('accepts a schema-valid scenario with the exact family consumer and adapter claim', () => {
    expect(run(fixture())).toEqual([])
  })

  it('rejects duplicate IDs and claims for nonexistent scenarios', () => {
    const contract = fixture()
    contract.scenarios = [
      ...(contract.scenarios as unknown[]),
      ...(contract.scenarios as unknown[]),
    ]
    contract.claims = [
      ...(contract.claims as unknown[]),
      {
        scenarioId: 'unknown-scenario',
        consumer: 'backend',
        adapter: 'backend-integrity-authority',
      },
    ]
    expect(run(contract)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate scenario ID'),
        expect.stringContaining('claims nonexistent scenario'),
      ]),
    )
  })

  it('rejects schema-invalid scenarios before semantic validation', () => {
    const contract = fixture()
    ;(contract.scenarios as Array<Record<string, unknown>>)[0].id = 'Not Stable'
    expect(run(contract)).toEqual(
      expect.arrayContaining([expect.stringContaining('must match pattern')]),
    )
  })

  it('diagnoses an unknown adapter instead of throwing', () => {
    const contract = fixture()
    ;(contract.claims as Array<Record<string, unknown>>)[0].adapter = 'missing-adapter'
    expect(run(contract)).toEqual(
      expect.arrayContaining([expect.stringContaining('unknown adapter "missing-adapter"')]),
    )
  })

  it('diagnoses an unknown family instead of throwing', () => {
    const contract = fixture()
    ;(contract.scenarios as Array<Record<string, unknown>>)[0].family = 'unregistered-family'
    const schema = schemaContent.replace(
      '"private-post-collection-browser"',
      '"private-post-collection-browser", "unregistered-family"',
    )
    expect(run(contract, schema)).toEqual(
      expect.arrayContaining([
        'scenario "integrity-report-resolution-exact-read-authoritative" has unknown family "unregistered-family"',
      ]),
    )
  })

  it('diagnoses an invalid JSON Schema instead of throwing', () => {
    expect(run(fixture(), JSON.stringify({ type: 'unknown-json-schema-type' }))).toEqual(
      expect.arrayContaining([expect.stringContaining('is not a valid schema')]),
    )
  })

  it('requires explicit manifest consumption and canonical adapter dispatch evidence', () => {
    const missingManifest = run(fixture(), schemaContent, root => {
      writeFileSync(join(root, LIFECYCLE_ADAPTERS['web-forward-pagination'].evidence.manifest), '')
    })
    expect(missingManifest).toEqual(
      expect.arrayContaining([
        expect.stringContaining('manifest evidence must consume lifecycle-scenarios.json'),
      ]),
    )

    const missingDispatch = run(fixture(), schemaContent, root => {
      writeFileSync(
        join(root, LIFECYCLE_ADAPTERS['web-forward-pagination'].evidence.dispatch),
        'lifecycle-scenarios.json',
      )
    })
    expect(missingDispatch).toEqual(
      expect.arrayContaining([
        expect.stringContaining('dispatch evidence must use its canonical adapter name'),
      ]),
    )
  })

  it('rejects a missing required claim and a duplicate consumer claim', () => {
    const missing = fixture({ claims: [] })
    expect(run(missing)).toEqual(
      expect.arrayContaining([expect.stringContaining('missing backend claim')]),
    )

    const duplicate = fixture()
    duplicate.claims = [...(duplicate.claims as unknown[]), ...(duplicate.claims as unknown[])]
    expect(run(duplicate)).toEqual(
      expect.arrayContaining([expect.stringContaining('duplicate backend claim')]),
    )
  })

  it('rejects self-attested family consumers and incompatible adapters', () => {
    const contract = fixture()
    const scenario = (contract.scenarios as Array<Record<string, unknown>>)[0]
    scenario.requiredConsumers = ['backend', 'web']
    ;(contract.claims as Array<Record<string, unknown>>)[0].adapter = 'web-integrity-reconciliation'
    expect(run(contract)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('requiredConsumers must exactly match'),
        expect.stringContaining('is not compatible with consumer backend'),
      ]),
    )
  })

  it('keeps every family policy nonempty and every registered adapter evidence-backed', () => {
    expect(Object.values(LIFECYCLE_FAMILY_CONSUMERS).every(value => value.length > 0)).toBe(true)
    expect(
      Object.values(LIFECYCLE_ADAPTERS).every(
        adapter => adapter.evidence.manifest.length > 0 && adapter.evidence.dispatch.length > 0,
      ),
    ).toBe(true)
  })

  it('uses the executable saved-post browser spec as private-post dispatch evidence', () => {
    expect(LIFECYCLE_ADAPTERS['web-playwright-private-post-collection'].evidence.dispatch).toBe(
      'playwright/tests/my/saved-posts-lifecycle-contract.spec.mts',
    )
  })
})
