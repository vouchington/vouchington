import { backendEvalTestProjects } from './backend-evals-projects.mts'
import { vitestProjectNames } from './vitest-project-names.mts'

/** The eval project names, read from the project objects `vitest.config.mts` runs. */
export const backendEvalProjectNames: readonly string[] = vitestProjectNames(
  backendEvalTestProjects,
  'Eval',
)
