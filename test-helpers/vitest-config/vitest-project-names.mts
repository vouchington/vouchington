import type { TestProjectConfiguration } from 'vitest/config'

/**
 * The names of Vitest project objects, for Node-run CI scripts that must not import
 * `vitest.config.mts`. Type-only vitest import, so it loads under plain Node type stripping.
 */
export function vitestProjectNames(
  projects: readonly TestProjectConfiguration[],
  kind: string,
): readonly string[] {
  return projects.map(configuration => {
    const test =
      typeof configuration === 'object' && 'test' in configuration ? configuration.test : undefined
    if (typeof test?.name !== 'string') {
      throw new TypeError(`${kind} Vitest projects need a string name`)
    }
    return test.name
  })
}
