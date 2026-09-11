import type { LifecycleScenarioInput } from './lifecycle-scenarios.mts'

export type PrivatePostCollectionScenario = {
  preconditions: { visibleCount: number; newerFilteredCount: number; limit: number }
  action: { type: 'fetch-first-page' | 'fetch-next-page' }
}

export function parsePrivatePostCollectionScenario(
  input: LifecycleScenarioInput,
): PrivatePostCollectionScenario {
  const action = input.action.type
  if (action !== 'fetch-first-page' && action !== 'fetch-next-page') {
    throw new Error(`Unknown backend private-post lifecycle action: ${action}`)
  }
  return {
    preconditions: {
      visibleCount: parsePositiveInteger(input.preconditions.visibleCount, 'visibleCount'),
      newerFilteredCount: parsePositiveInteger(
        input.preconditions.newerFilteredCount,
        'newerFilteredCount',
      ),
      limit: parsePositiveInteger(input.preconditions.limit, 'limit'),
    },
    action: { type: action },
  }
}

function parsePositiveInteger(value: unknown, key: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`Backend private-post lifecycle scenario has invalid ${key}`)
  }
  return value as number
}
