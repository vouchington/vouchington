import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'
import { SEEDED_ROWS_BY_RELATION } from './plan-seeded-rows.mts'
import { isKnownCustomPlanCheck } from './plan-custom-checks.mts'

export type PlanExpectation =
  | { kind: 'maxProcessedRows'; relation: string; max: number }
  | { kind: 'maxBitmapIndexRows'; max: number }
  | {
      kind: 'usesIndexes'
      indexes: readonly string[]
      /** The listed indexes are equivalent access paths: using any one satisfies the gate. */
      anyOf?: boolean
      queryContains?: string
      noSort?: boolean
    }
  | { kind: 'queryBinds'; token: string }
  | { kind: 'forbidCorrelatedAggregates' }
  | { kind: 'singleLeaf'; parent: string; key?: string }
  | { kind: 'maxFunctionCalls'; function: string; max: number }
  | { kind: 'custom'; name: string }

export interface ScenarioPlanContract {
  expectations: readonly PlanExpectation[]
  /** Capture the first changes to pages after a checkpoint, including full-page images in WAL. */
  walCaptureCondition?: 'cold'
  /** Preserve an indexed access-path requirement even with a smaller setup corpus. */
  forbidSequentialScans?: readonly string[]
  /** A negative-match probe can prove that indexed candidates skip a large nonmatching seed. */
  allowEmptyResult?: boolean
  /** Seeded rows in each unbounded relation that this scenario reads. */
  seededRows?: Readonly<Record<string, number>>
  /** An intentional multi-leaf read requires a concrete reason. */
  crossPartition?: Readonly<Record<string, string>>
}

// These default fixtures previously exceeded the generic sequential-scan threshold. A scenario
// declaring its own smaller cohort retains its own policy instead of inheriting this requirement.
const INDEXED_SETUP_FIXTURES = ['agent_moderations', 'copyright_notice_evidence_artifacts']

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
    forbidSequentialScans: [
      ...INDEXED_SETUP_FIXTURES.filter(relation => contract.seededRows?.[relation] === undefined),
      ...(contract.forbidSequentialScans ?? []),
    ],
    seededRows: { ...SEEDED_ROWS_BY_RELATION, ...contract.seededRows },
  })
}

export function ensureScenarioContract(id: string): void {
  if (!registered.has(id)) registerScenarioContract(id, { expectations: [] })
}

export function getScenarioContract(id: string): ScenarioPlanContract {
  if (!known.has(id)) throw new Error(`Unknown EXPLAIN scenario: ${id}`)
  return (
    registered.get(id) ?? {
      expectations: [],
      forbidSequentialScans: INDEXED_SETUP_FIXTURES,
      seededRows: SEEDED_ROWS_BY_RELATION,
    }
  )
}

/** Run after capture so a stale registration cannot silently stop guarding a query. */
export function assertPlanRegistry(
  capturedIds: readonly string[],
  /** A shard imports every runner module, whose import-time registrations outside its scope never run. */
  scopeIds?: readonly string[],
): void {
  const captured = new Set(capturedIds)
  const scope = scopeIds && new Set(scopeIds)
  for (const [id, contract] of registered) {
    if (scope && !scope.has(id)) continue
    assertExpectationKinds(id, contract)
    if (!captured.has(id)) throw new Error(`Registered scenario ${id} has no captured result`)
  }
  for (const id of captured) if (!known.has(id)) throw new Error(`Unknown EXPLAIN scenario: ${id}`)
}

function assertExpectationKinds(id: string, contract: ScenarioPlanContract): void {
  const kinds = new Set([
    'maxProcessedRows',
    'maxBitmapIndexRows',
    'usesIndexes',
    'queryBinds',
    'forbidCorrelatedAggregates',
    'singleLeaf',
    'maxFunctionCalls',
    'custom',
  ])
  for (const expectation of contract.expectations)
    if (!kinds.has(expectation.kind))
      throw new Error(`Unknown plan expectation kind: ${expectation.kind} in ${id}`)
    else if (expectation.kind === 'custom' && !isKnownCustomPlanCheck(expectation.name))
      throw new Error(`Unknown custom plan check: ${expectation.name} in ${id}`)
    else if (
      expectation.kind === 'maxFunctionCalls' &&
      (expectation.function.trim() === '' ||
        !Number.isSafeInteger(expectation.max) ||
        expectation.max < 0)
    )
      throw new Error(`${id} needs a nonempty function and a nonnegative call cap`)
}
