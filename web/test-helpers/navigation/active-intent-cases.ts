import { expect } from 'vitest'

export type ActiveIntentCheck = readonly [path: string, intent: string]

export function expectActiveIntent(
  resolve: (path: string) => string,
  checks: readonly ActiveIntentCheck[],
) {
  for (const [path, intent] of checks) {
    expect(resolve(path)).toBe(intent)
  }
}
