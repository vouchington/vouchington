import manifest from '../../api-fixtures/v1/lifecycle-scenarios.json' with { type: 'json' }

export interface BrowserLifecycleClaim {
  scenarioId: string
  consumer: string
  adapter: string
}

export interface BrowserLifecycleObservation {
  visibleState: Record<string, unknown>
  availableActions: string[]
  reconciliation: Record<string, unknown>
  cancellation: Record<string, unknown>
}

interface BrowserLifecycleScenario {
  id: string
  family: string
  requiredConsumers: string[]
  input: {
    preconditions: Record<string, unknown>
    action: { type: string } & Record<string, unknown>
    serverOutcome: Record<string, unknown>
  }
  expected: BrowserLifecycleObservation
}

export interface BrowserLifecycleManifest {
  scenarios: BrowserLifecycleScenario[]
  claims: BrowserLifecycleClaim[]
}

export type PrivatePostCollectionBrowserAdapter = 'web-playwright-private-post-collection'

export interface PrivatePostCollectionContinuationInput {
  preconditions: { visibleCount: number; newerFilteredCount: number; pageSize: number }
  action: { type: 'load-more' }
  serverOutcome: { loadedVisibleCount: number }
}

export interface PrivatePostCollectionRemovalInput {
  preconditions: { loadedItemIds: string[] }
  action: { type: 'remove'; itemId: string }
  serverOutcome: { removed: boolean }
}

export type PrivatePostCollectionBrowserInput =
  | PrivatePostCollectionContinuationInput
  | PrivatePostCollectionRemovalInput

export interface PrivatePostCollectionBrowserClaim {
  scenario: Omit<BrowserLifecycleScenario, 'input'> & {
    input: PrivatePostCollectionBrowserInput
  }
  claim: BrowserLifecycleClaim
}

export function loadLifecycleScenarioManifest(): BrowserLifecycleManifest {
  return manifest as BrowserLifecycleManifest
}

export function getPrivatePostCollectionBrowserClaims(
  adapter: PrivatePostCollectionBrowserAdapter,
): PrivatePostCollectionBrowserClaim[] {
  const lifecycleManifest = loadLifecycleScenarioManifest()
  const scenariosById = new Map(
    lifecycleManifest.scenarios.map(scenario => [scenario.id, scenario]),
  )
  return lifecycleManifest.claims.flatMap(claim => {
    if (claim.consumer !== 'web' || claim.adapter !== adapter) {
      return []
    }
    const scenario = scenariosById.get(claim.scenarioId)
    if (!scenario)
      throw new Error(`Browser lifecycle claim references unknown scenario: ${claim.scenarioId}`)
    return [{ scenario: { ...scenario, input: parsePrivatePostCollectionInput(scenario) }, claim }]
  })
}

function parsePrivatePostCollectionInput(
  scenario: BrowserLifecycleScenario,
): PrivatePostCollectionBrowserInput {
  const { action, preconditions, serverOutcome } = scenario.input
  if (action.type === 'load-more') {
    return {
      preconditions: {
        visibleCount: positiveInteger(preconditions.visibleCount, scenario.id, 'visibleCount'),
        newerFilteredCount: positiveInteger(
          preconditions.newerFilteredCount,
          scenario.id,
          'newerFilteredCount',
        ),
        pageSize: positiveInteger(preconditions.pageSize, scenario.id, 'pageSize'),
      },
      action: { type: 'load-more' },
      serverOutcome: {
        loadedVisibleCount: positiveInteger(
          serverOutcome.loadedVisibleCount,
          scenario.id,
          'loadedVisibleCount',
        ),
      },
    }
  }
  if (action.type === 'remove') {
    const loadedItemIds = stringArray(preconditions.loadedItemIds, scenario.id, 'loadedItemIds')
    const itemId = stringValue(action.itemId, scenario.id, 'itemId')
    if (!loadedItemIds.includes(itemId)) {
      throw new Error(
        `Browser lifecycle scenario ${scenario.id} removes an unloaded item: ${itemId}`,
      )
    }
    return {
      preconditions: { loadedItemIds },
      action: { type: 'remove', itemId },
      serverOutcome: { removed: booleanValue(serverOutcome.removed, scenario.id, 'removed') },
    }
  }
  throw new Error(`Unknown private-post browser lifecycle action: ${action.type}`)
}

function positiveInteger(value: unknown, scenarioId: string, key: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`Browser lifecycle scenario ${scenarioId} has invalid ${key}`)
  }
  return value as number
}

function stringArray(value: unknown, scenarioId: string, key: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(item => typeof item === 'string')
  ) {
    throw new Error(`Browser lifecycle scenario ${scenarioId} has invalid ${key}`)
  }
  return value
}

function stringValue(value: unknown, scenarioId: string, key: string): string {
  if (typeof value !== 'string')
    throw new Error(`Browser lifecycle scenario ${scenarioId} has invalid ${key}`)
  return value
}

function booleanValue(value: unknown, scenarioId: string, key: string): boolean {
  if (typeof value !== 'boolean')
    throw new Error(`Browser lifecycle scenario ${scenarioId} has invalid ${key}`)
  return value
}
