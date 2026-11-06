import { parse as loadYaml } from 'yaml'
import type { WorkflowSource } from './workflow-artifact-policy.mts'

const EXPECTED_RUN =
  'node ci/artifact-upload-outcome.mts "$FAMILY" "$SUITE" "$FIRST_OUTCOME" "$RETRY_OUTCOME"'

export type OutcomeStep = {
  name?: string
  id?: string
  run?: string
  env?: Record<string, unknown>
}
type ProducerWorkflow = { jobs?: Record<string, { steps?: OutcomeStep[] }> }

const EXPECTED_SUITES = [
  'backend-modules',
  'backend-native-migrations',
  'backend-native-mv',
  'backend-shard-${{ matrix.shard }}',
  'cloudflare-worker',
  'lambdas',
  'portability-linux',
  'tooling',
  'ts-shared',
  'web-api-shard-${{ matrix.shard }}',
  'web-integration-shard-${{ matrix.shard }}',
  'web-shard-${{ matrix.shard }}',
  'web-storybook',
  'web-storybook-browser',
] as const

export function outcomeSteps(files: readonly WorkflowSource[]): OutcomeStep[] {
  return files.flatMap(({ path, source }) => {
    if (!path.startsWith('.github/workflows/')) return []
    const workflow = loadYaml(source) as ProducerWorkflow
    return Object.values(workflow.jobs ?? {}).flatMap(job =>
      (job.steps ?? []).filter(step => step.run === EXPECTED_RUN),
    )
  })
}

/** Exact producer family and env shape for consolidated artifact-upload outcomes. */
export function artifactUploadOutcomeViolations(files: readonly WorkflowSource[]): string[] {
  const steps = outcomeSteps(files)
  const violations: string[] = []
  if (steps.length !== EXPECTED_SUITES.length)
    violations.push(
      `Expected ${EXPECTED_SUITES.length} artifact outcome steps, got ${steps.length}`,
    )
  const suites = steps.map(step => String(step.env?.SUITE)).toSorted()
  if (JSON.stringify(suites) !== JSON.stringify(EXPECTED_SUITES))
    violations.push(`Unexpected artifact outcome suites: ${JSON.stringify(suites)}`)
  for (const step of steps) {
    const env = step.env ?? {}
    if (
      JSON.stringify(Object.keys(env).toSorted()) !==
      JSON.stringify(['FAMILY', 'FIRST_OUTCOME', 'RETRY_OUTCOME', 'SUITE'])
    )
      violations.push(`Artifact outcome step has unexpected env keys: ${JSON.stringify(env)}`)
    if (env.FAMILY !== 'full-lcov') violations.push('Artifact outcome family must be full-lcov')
    if (typeof env.SUITE !== 'string' || env.SUITE.length === 0)
      violations.push('Artifact outcome suite must be a nonempty string')
    if (
      typeof env.FIRST_OUTCOME !== 'string' ||
      !/^\$\{\{ steps\.[\w-]+\.outcome \}\}$/.test(env.FIRST_OUTCOME)
    )
      violations.push('Artifact outcome FIRST_OUTCOME must reference a step outcome')
    if (
      typeof env.RETRY_OUTCOME !== 'string' ||
      !/^\$\{\{ steps\.[\w-]+\.outcome \}\}$/.test(env.RETRY_OUTCOME)
    )
      violations.push('Artifact outcome RETRY_OUTCOME must reference a step outcome')
  }
  return violations
}
