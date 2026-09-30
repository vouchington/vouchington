import { backendCredentialedTestProjects } from './backend-credentialed-projects.mts'

/**
 * The credentialed Vitest projects that probe a real external provider, each paired with the
 * `include` glob(s) it collects, read from the same project objects `vitest.config.mts` runs
 * (`backend-credentialed-projects.mts`). Node-run CI scripts (`ci/run-vitest-project-group.mts`, the
 * transient-retry classifier) import this instead of copying the names, and it loads under plain
 * Node type stripping because neither module touches `vitest.config.mts`'s DB/Valkey aliasing.
 */
export const backendCredentialedProjects: ReadonlyArray<{
  project: string
  include: readonly string[]
}> = backendCredentialedTestProjects.map(configuration => {
  const test =
    typeof configuration === 'object' && 'test' in configuration ? configuration.test : undefined
  if (typeof test?.name !== 'string' || !test.include?.length) {
    throw new TypeError('Credentialed Vitest projects need a string name and a non-empty include')
  }
  return { project: test.name, include: test.include }
})

export const backendCredentialedProjectNames: readonly string[] = backendCredentialedProjects.map(
  ({ project }) => project,
)
