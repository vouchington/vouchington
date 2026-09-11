import {
  getWebLifecycleClaim,
  getWebLifecycleScenarios,
  loadLifecycleScenarioManifest,
  validateManifest,
  type LifecycleScenarioManifest,
} from './manifest'
import { webLifecycleAdapters, type LifecycleObservation } from './adapters'

function sameJson(actual: unknown, expected: unknown, path: string): void {
  if (typeof actual !== typeof expected || actual === null || expected === null) {
    if (actual !== expected)
      throw new Error(`${path}: expected ${String(expected)}, got ${String(actual)}`)
    return
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
      throw new Error(`${path}: array shape differs`)
    }
    actual.forEach((item, index) => sameJson(item, expected[index]!, `${path}[${index}]`))
    return
  }
  if (typeof actual === 'object' && typeof expected === 'object') {
    const actualRecord = actual as Record<string, unknown>
    const expectedRecord = expected as Record<string, unknown>
    const actualKeys = Object.keys(actualRecord).toSorted()
    const expectedKeys = Object.keys(expectedRecord).toSorted()
    if (actualKeys.join('\u0000') !== expectedKeys.join('\u0000')) {
      throw new Error(`${path}: object keys differ`)
    }
    for (const key of expectedKeys) {
      sameJson(actualRecord[key], expectedRecord[key], `${path}.${key}`)
    }
    return
  }
  if (actual !== expected)
    throw new Error(`${path}: expected ${String(expected)}, got ${String(actual)}`)
}

function compareObservation(
  scenarioId: string,
  actual: LifecycleObservation,
  expected: LifecycleObservation,
): void {
  sameJson(actual.visibleState, expected.visibleState, `${scenarioId}.visibleState`)
  sameJson(actual.availableActions, expected.availableActions, `${scenarioId}.availableActions`)
  sameJson(actual.reconciliation, expected.reconciliation, `${scenarioId}.reconciliation`)
  sameJson(actual.cancellation, expected.cancellation, `${scenarioId}.cancellation`)
}

export async function runWebLifecycleScenario(
  scenarioId: string,
  manifest: LifecycleScenarioManifest = loadLifecycleScenarioManifest(),
): Promise<LifecycleObservation> {
  validateManifest(manifest)
  const scenario = manifest.scenarios.find(candidate => candidate.id === scenarioId)
  if (!scenario || !scenario.requiredConsumers.includes('web')) {
    throw new Error(`Lifecycle scenario is not applicable to web: ${scenarioId}`)
  }
  const claim = getWebLifecycleClaim(scenarioId, manifest)
  const adapter = webLifecycleAdapters[claim.adapter]
  if (!adapter) throw new Error(`Unknown web lifecycle adapter: ${claim.adapter}`)
  const actual = await adapter(scenario.input)
  compareObservation(scenarioId, actual, scenario.expected)
  return actual
}

export async function runWebLifecycleContract(
  manifest: LifecycleScenarioManifest = loadLifecycleScenarioManifest(),
): Promise<void> {
  validateManifest(manifest)
  await Promise.all(
    getWebLifecycleScenarios(manifest).map(scenario =>
      runWebLifecycleScenario(scenario.id, manifest),
    ),
  )
}
