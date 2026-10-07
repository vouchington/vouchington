import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'
import { SEEDED_ROWS_BY_RELATION } from './plan-seeded-rows.mts'
import { isKnownCustomPlanCheck } from './plan-custom-checks.mts'

export type PlanExpectation =
  | { kind: 'maxProcessedRows'; relation: string; max: number }
  | { kind: 'usesIndexes'; indexes: readonly string[]; queryContains?: string; noSort?: boolean }
  | { kind: 'queryBinds'; token: string }
  | { kind: 'forbidCorrelatedAggregates' }
  | { kind: 'singleLeaf'; parent: string; key?: string }
  | { kind: 'custom'; name: string }

export interface ScenarioPlanContract {
  expectations: readonly PlanExpectation[]
  /** Seeded rows in each unbounded relation that this scenario reads. */
  seededRows?: Readonly<Record<string, number>>
  /** An intentional multi-leaf read requires a concrete reason. */
  crossPartition?: Readonly<Record<string, string>>
}

const known = new Set<string>(EXPLAIN_SCENARIO_MANIFEST)
const registered = new Map<string, ScenarioPlanContract>()

export function registerScenarioContract(id: string, contract: ScenarioPlanContract): void {
  if (!known.has(id)) throw new Error(`Unknown EXPLAIN scenario: ${id}`)
  if (registered.has(id)) throw new Error(`Duplicate plan contract for ${id}`)
  assertExpectationKinds(id, contract)
  for (const [parent, reason] of Object.entries(contract.crossPartition ?? {}))
    if (reason.trim() === '') throw new Error(`${id} needs a crossPartition reason for ${parent}`)
  registered.set(id, {
    ...contract,
    seededRows: { ...SEEDED_ROWS_BY_RELATION, ...contract.seededRows },
  })
}

export function ensureScenarioContract(id: string): void {
  if (!registered.has(id)) registerScenarioContract(id, { expectations: [] })
}

export function getScenarioContract(id: string): ScenarioPlanContract {
  if (!known.has(id)) throw new Error(`Unknown EXPLAIN scenario: ${id}`)
  return registered.get(id) ?? { expectations: [], seededRows: SEEDED_ROWS_BY_RELATION }
}

/** Run after capture so a stale registration cannot silently stop guarding a query. */
export function assertPlanRegistry(capturedIds: readonly string[]): void {
  const captured = new Set(capturedIds)
  for (const [id, contract] of registered) {
    assertExpectationKinds(id, contract)
    if (!captured.has(id)) throw new Error(`Registered scenario ${id} has no captured result`)
  }
  for (const id of captured) if (!known.has(id)) throw new Error(`Unknown EXPLAIN scenario: ${id}`)
}

export function assertExpectationKinds(id: string, contract: ScenarioPlanContract): void {
  const kinds = new Set([
    'maxProcessedRows',
    'usesIndexes',
    'queryBinds',
    'forbidCorrelatedAggregates',
    'singleLeaf',
    'custom',
  ])
  for (const expectation of contract.expectations)
    if (!kinds.has(expectation.kind))
      throw new Error(`Unknown plan expectation kind: ${expectation.kind} in ${id}`)
    else if (expectation.kind === 'custom' && !isKnownCustomPlanCheck(expectation.name))
      throw new Error(`Unknown custom plan check: ${expectation.name} in ${id}`)
}

/** Unit tests use this to avoid leaking dynamic declarations between cases. */
export function resetScenarioContracts(): void {
  registered.clear()
}
