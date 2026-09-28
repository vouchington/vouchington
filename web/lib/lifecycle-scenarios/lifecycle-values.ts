import type { LifecycleJson, LifecycleScenarioInput } from './manifest'

export interface LifecycleObservation {
  visibleState: Record<string, LifecycleJson | undefined>
  availableActions: string[]
  reconciliation: Record<string, LifecycleJson | undefined>
  cancellation: Record<string, LifecycleJson | undefined>
}

export type LifecycleAdapter = (
  input: LifecycleScenarioInput,
) => LifecycleObservation | Promise<LifecycleObservation>

export const lifecycleNotApplicable = { behavior: 'not-applicable' } satisfies Record<
  string,
  LifecycleJson
>

export function stringValue(input: Record<string, LifecycleJson>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' ? value : undefined
}

export function nullableStringValue(
  input: Record<string, LifecycleJson>,
  key: string,
): string | null {
  const value = input[key]
  return typeof value === 'string' ? value : null
}

export function booleanValue(input: Record<string, LifecycleJson>, key: string): boolean {
  return input[key] === true
}

export function numberValue(input: Record<string, LifecycleJson>, key: string): number | undefined {
  const value = input[key]
  return typeof value === 'number' ? value : undefined
}

export function stringArrayValue(input: Record<string, LifecycleJson>, key: string): string[] {
  const value = input[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}
