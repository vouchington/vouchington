import manifest from '@voucha/api-fixtures/v1/lifecycle-scenarios.json' with { type: 'json' }

export type LifecycleScenarioConsumer = 'backend' | 'web' | 'swift' | 'dotnet'

export type LifecycleScenarioInput = {
  preconditions: Record<string, unknown>
  action: { type: string } & Record<string, unknown>
  serverOutcome: Record<string, unknown>
}

export type LifecycleScenario = {
  id: string
  family: string
  requiredConsumers: LifecycleScenarioConsumer[]
  input: LifecycleScenarioInput
  expected: LifecycleScenarioExpected
  backendExpected?: LifecycleScenarioObservation
}

export type LifecycleScenarioObservation = {
  visibleState: Record<string, unknown>
  availableActions: string[]
  reconciliation: Record<string, unknown>
  cancellation: Record<string, unknown>
}

export type LifecycleScenarioExpected = LifecycleScenarioObservation

export type LifecycleScenarioClaim = {
  scenarioId: string
  consumer: LifecycleScenarioConsumer
  adapter: string
}

export type LifecycleScenarioManifest = {
  version: 1
  scenarios: LifecycleScenario[]
  claims: LifecycleScenarioClaim[]
}

const lifecycleScenarioManifest = manifest as LifecycleScenarioManifest

export function loadLifecycleScenarioManifest(): LifecycleScenarioManifest {
  return lifecycleScenarioManifest
}

export function loadLifecycleScenario(id: string): LifecycleScenario {
  const scenario = lifecycleScenarioManifest.scenarios.find(candidate => candidate.id === id)
  if (!scenario) throw new Error(`Unknown lifecycle scenario: ${id}`)
  return scenario
}

export function loadLifecycleScenarioClaims(
  scenarioId: string,
  consumer: LifecycleScenarioConsumer,
): LifecycleScenarioClaim[] {
  return lifecycleScenarioManifest.claims.filter(
    claim => claim.scenarioId === scenarioId && claim.consumer === consumer,
  )
}

export function getBackendLifecycleClaims(): Array<{
  scenario: LifecycleScenario
  claim: LifecycleScenarioClaim
}> {
  const scenariosById = new Map(
    lifecycleScenarioManifest.scenarios.map(scenario => [scenario.id, scenario]),
  )
  return lifecycleScenarioManifest.claims.flatMap(claim => {
    if (claim.consumer !== 'backend') return []
    const scenario = scenariosById.get(claim.scenarioId)
    if (!scenario) throw new Error(`Backend claim references unknown scenario: ${claim.scenarioId}`)
    return [{ scenario, claim }]
  })
}

export function getBackendExpectedObservation(
  scenario: LifecycleScenario,
): LifecycleScenarioObservation {
  const backendExpected = scenario.backendExpected
  if (!backendExpected) {
    throw new Error(`Backend lifecycle scenario has no server observation: ${scenario.id}`)
  }
  return backendExpected
}
