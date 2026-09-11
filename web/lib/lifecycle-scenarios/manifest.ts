import lifecycleScenarioManifest from '../../../api-fixtures/v1/lifecycle-scenarios.json'

const moderationAppealViewerRoles = new Set(['administrator', 'moderator', 'member'])

export type LifecycleJson =
  | string
  | number
  | boolean
  | null
  | LifecycleJson[]
  | { [key: string]: LifecycleJson }

export interface LifecycleScenarioInput {
  preconditions: Record<string, LifecycleJson>
  action: Record<string, LifecycleJson>
  serverOutcome: Record<string, LifecycleJson>
}

export interface LifecycleScenarioExpected {
  visibleState: Record<string, LifecycleJson>
  availableActions: string[]
  reconciliation: Record<string, LifecycleJson>
  cancellation: Record<string, LifecycleJson>
}

export interface LifecycleScenario {
  id: string
  family: string
  requiredConsumers: string[]
  input: LifecycleScenarioInput
  expected: LifecycleScenarioExpected
}

export interface LifecycleClaim {
  scenarioId: string
  consumer: string
  adapter: string
}

export interface LifecycleScenarioManifest {
  $schema: './lifecycle-scenarios.schema.json'
  version: 1
  scenarios: LifecycleScenario[]
  claims: LifecycleClaim[]
}

export function loadLifecycleScenarioManifest(): LifecycleScenarioManifest {
  const parsed = lifecycleScenarioManifest as unknown as LifecycleScenarioManifest
  validateManifest(parsed)
  return parsed
}

export function validateManifest(manifest: LifecycleScenarioManifest): void {
  if (manifest.version !== 1) throw new Error('Unsupported lifecycle scenario manifest version')
  const ids = new Set<string>()
  for (const scenario of manifest.scenarios) {
    if (ids.has(scenario.id)) throw new Error(`Duplicate lifecycle scenario ID: ${scenario.id}`)
    ids.add(scenario.id)
    if (
      scenario.family === 'moderation-appeal-lifecycle' &&
      !moderationAppealViewerRoles.has(scenario.input.preconditions.viewerRole as string)
    ) {
      throw new Error(`Invalid moderation appeal viewerRole for ${scenario.id}`)
    }
  }
  for (const claim of manifest.claims) {
    if (!ids.has(claim.scenarioId)) {
      throw new Error(`Lifecycle claim references unknown scenario: ${claim.scenarioId}`)
    }
  }
}

export function getWebLifecycleScenarios(
  manifest = loadLifecycleScenarioManifest(),
): LifecycleScenario[] {
  return manifest.scenarios.filter(scenario => scenario.requiredConsumers.includes('web'))
}

export function getWebLifecycleClaim(
  scenarioId: string,
  manifest = loadLifecycleScenarioManifest(),
): LifecycleClaim {
  const claims = manifest.claims.filter(
    claim => claim.consumer === 'web' && claim.scenarioId === scenarioId,
  )
  if (claims.length !== 1) {
    throw new Error(`Expected exactly one web lifecycle claim for ${scenarioId}`)
  }
  return claims[0]!
}
