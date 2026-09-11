import { vi } from 'vitest'

/**
 * Partial-mock `lucide-react` while preserving every unmocked icon export.
 *
 * Bare `vi.mock('lucide-react', () => ({ ... }))` replaces the whole module and
 * silently drops icons the component renders (the PR #6077 regression). Always go
 * through this helper, which spreads the real module first.
 *
 * Enforced by the `web-test-no-bare-lucide-mock` ast-grep rule.
 *
 * @example
 *   vi.mock('lucide-react', () => mockLucideReact({ Loader2: () => null }))
 */
export async function mockLucideReact<T extends Record<string, unknown>>(
  overrides: T = {} as T,
): Promise<typeof import('lucide-react') & T> {
  const actual = await vi.importActual<typeof import('lucide-react')>('lucide-react')
  return { ...actual, ...overrides }
}
