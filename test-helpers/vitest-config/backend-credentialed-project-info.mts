import { backendCredentialedTestProjects } from './backend-credentialed-projects.mts'

/**
 * The names of the credentialed Vitest projects that probe a real external provider, read from the
 * same project objects `vitest.config.mts` runs (`backend-credentialed-projects.mts`). Node-run CI
 * scripts (`ci/run-vitest-project-group.mts`) and the workflow tests import this instead of copying
 * the names, and it loads under plain Node type stripping because neither module touches
 * `vitest.config.mts`'s DB/Valkey aliasing.
 */
export const backendCredentialedProjectNames: readonly string[] =
  backendCredentialedTestProjects.map(configuration => {
    const test =
      typeof configuration === 'object' && 'test' in configuration ? configuration.test : undefined
    if (typeof test?.name !== 'string') {
      throw new TypeError('Credentialed Vitest projects need a string name')
    }
    return test.name
  })
