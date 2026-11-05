import {
  workflowHasMainPushTrigger,
  workflowRunSubscriptions,
  workflowTriggerNames,
} from './workflow-trigger-policy.mts'

const pgvectorImagePattern = /ghcr\.io\/vouchington\/dependency-pgvector:[^\s'"\\)]+/g
const pgvectorDigestPinnedPattern =
  /^ghcr\.io\/vouchington\/dependency-pgvector:[\w.-]+@sha256:[0-9a-f]{64}$/u
const requiredPostgresInitdbArgs = '-c max_connections=300 -c log_min_messages=log'
const explainAnalyzePostgresInitdbArgs = `${requiredPostgresInitdbArgs} -c work_mem=32MB`
const requiredDockerInitdbArgs = `POSTGRES_INITDB_ARGS="${requiredPostgresInitdbArgs}"`

export type OpsWorkflowStep = {
  name?: string
  id?: string
  if?: string | boolean
  run?: string
  uses?: string
  env?: Record<string, unknown>
  with?: Record<string, unknown>
}

export type OpsWorkflowJob = {
  'runs-on'?: string | string[]
  needs?: string | string[]
  if?: string
  outputs?: Record<string, string>
  permissions?: Record<string, string>
  steps?: OpsWorkflowStep[]
  secrets?: string | Record<string, unknown>
  with?: Record<string, unknown>
  services?: Record<string, { env?: Record<string, string> }>
}

export type OpsWorkflow = {
  name?: string
  on?: unknown
  permissions?: Record<string, string>
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
  jobs?: Record<string, OpsWorkflowJob>
}

export type WorkflowSources = Readonly<Record<string, string>>
export type WorkflowDocuments = Readonly<Record<string, OpsWorkflow>>
export type CiPathFilters = Readonly<Record<string, readonly string[]>>

function namesForMainPush(workflows: WorkflowDocuments): string[] {
  return Object.entries(workflows).flatMap(([path, workflow]) =>
    path.startsWith('.github/workflows/') && workflowHasMainPushTrigger(workflow) && workflow.name
      ? [workflow.name]
      : [],
  )
}

function namesForNightlyRecovery(workflows: WorkflowDocuments): string[] {
  return Object.entries(workflows).flatMap(([path, workflow]) => {
    if (
      !path.startsWith('.github/workflows/') ||
      workflow.name !== 'Nightly' ||
      !workflowTriggerNames(workflow.on).includes('schedule') ||
      !workflowTriggerNames(workflow.on).includes('workflow_dispatch')
    ) {
      return []
    }
    return [workflow.name]
  })
}

/** Match the fix-main subscriptions to the tracked main-push and Nightly workflows. */
export function fixMainSubscriptionViolations(workflows: WorkflowDocuments): string[] {
  const fixMain = workflows['.github/workflows/fix-main.yml']
  if (!fixMain) return ['.github/workflows/fix-main.yml is missing']

  const expected = [
    ...namesForMainPush(workflows),
    ...namesForNightlyRecovery(workflows),
    'Dispatch completed deploy',
  ].toSorted()
  const subscribed = workflowRunSubscriptions(fixMain.on).toSorted()
  if (expected.length > 0 && JSON.stringify(subscribed) === JSON.stringify(expected)) return []
  return [
    `.github/workflows/fix-main.yml workflow_run subscriptions differ: ${subscribed.join(', ')}`,
  ]
}

/** Enforce the repository-wide postgres workflow image and service settings. */
export function postgresWorkflowPolicyViolations(
  sources: WorkflowSources,
  workflows: WorkflowDocuments,
): string[] {
  const violations: string[] = []
  const references = Object.entries(sources).flatMap(([path, source]) =>
    path.startsWith('.github/workflows/')
      ? [...source.matchAll(pgvectorImagePattern)].map(([reference]) => reference)
      : [],
  )
  if (references.length === 0) violations.push('No workflow pgvector image references found')
  for (const reference of references) {
    if (!pgvectorDigestPinnedPattern.test(reference))
      violations.push(`Postgres workflow image is not digest pinned: ${reference}`)
  }
  if (new Set(references).size !== 1)
    violations.push(
      `Postgres workflow images must use one digest-pinned reference; found ${references.length}`,
    )

  const postgresServices = Object.entries(workflows).flatMap(([path, workflow]) =>
    Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) =>
      job.services?.postgres
        ? [{ path, jobName, initdbArgs: job.services.postgres.env?.POSTGRES_INITDB_ARGS }]
        : [],
    ),
  )
  if (postgresServices.length === 0) violations.push('No postgres workflow services found')
  for (const service of postgresServices) {
    const fileName = service.path.split('/').at(-1)
    const expected =
      fileName === 'explain-analyze.yml'
        ? explainAnalyzePostgresInitdbArgs
        : requiredPostgresInitdbArgs
    if (service.initdbArgs !== expected)
      violations.push(
        `${service.path}#${service.jobName} POSTGRES_INITDB_ARGS must equal ${expected}`,
      )
  }
  const smokeWorkflow = sources['.github/workflows/initialize-smoke-test.yml']
  if (!smokeWorkflow?.includes(requiredDockerInitdbArgs))
    violations.push(
      '.github/workflows/initialize-smoke-test.yml must use the shared Docker postgres settings',
    )
  return violations
}
