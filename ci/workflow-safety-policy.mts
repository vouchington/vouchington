import {
  gitSubcommandPattern,
  shellLogicalLines,
  workflowHasTrigger,
} from './workflow-shell-policy.mts'

type Step = {
  name?: string
  run?: string
  uses?: string
  env?: Record<string, unknown>
  with?: Record<string, unknown>
}
export type SafetyWorkflow = {
  on?: unknown
  jobs?: Record<
    string,
    {
      steps?: Step[]
      uses?: string
      secrets?: string | Record<string, unknown>
    }
  >
}
type SecretWorkflow = {
  on?: { workflow_call?: { secrets?: Record<string, { required?: boolean }> } }
  jobs?: SafetyWorkflow['jobs']
}

/** Reusable callers must pass declared secrets explicitly, including required inputs. */
export function workflowCallSecretViolations(workflows: Record<string, SecretWorkflow>): string[] {
  return Object.entries(workflows).flatMap(([path, workflow]) =>
    Object.entries(workflow.jobs ?? {}).flatMap(([jobId, job]) => {
      const label = `${path}#${jobId}`
      if (job.secrets === 'inherit')
        return [`${label}: pass the callee declared secrets explicitly`]
      if (!job.uses?.startsWith('./.github/workflows/')) return []
      const calleePath = job.uses.slice('./'.length)
      const declared = workflows[calleePath]?.on?.workflow_call?.secrets ?? {}
      const passed = job.secrets == null ? [] : Object.keys(job.secrets)
      return [
        ...passed.flatMap(name =>
          Object.hasOwn(declared, name)
            ? []
            : [`${label}: ${name} is not declared by ${calleePath}`],
        ),
        ...Object.entries(declared).flatMap(([name, spec]) =>
          spec?.required === true && !passed.includes(name)
            ? [`${label}: pass required secret ${name} from ${calleePath}`]
            : [],
        ),
      ]
    }),
  )
}

/** Check repository-wide shell, download, startup and cross-workflow wait invariants. */
export function workflowSafetyViolations(
  path: string,
  source: string,
  workflow: SafetyWorkflow,
): string[] {
  const violations: string[] = []
  if (/^\s+BASH_ENV:(?!(?:\s*(?:\/dev\/null|["']\/dev\/null["'])\s*(?:#.*)?$))/m.test(source))
    violations.push(`${path}: BASH_ENV must be /dev/null`)
  for (const forbidden of [
    'NODE_OPTIONS: --disable-warning=DEP0205',
    'load-runner-env',
    'vars.VITEST_MAX_WORKERS',
    'vars.PLAYWRIGHT_MAX_WORKERS',
  ]) {
    if (source.includes(forbidden))
      violations.push(`${path}: forbidden workflow startup setting ${forbidden}`)
  }
  const commit = gitSubcommandPattern('commit')
  const push = gitSubcommandPattern('push')
  const slug = path.replace(/^\.github\/workflows\//, '').replace(/\.ya?ml$/, '')
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    if (/^wait-/.test(jobId))
      violations.push(`Job "${jobId}" in ${path} looks like an idle-poll wait job`)
    for (const [index, step] of (job.steps ?? []).entries()) {
      const label = `${slug}#${jobId} step ${step.name ?? index}`
      for (const line of shellLogicalLines(step.run ?? '')) {
        if (/^\s*#/.test(line)) continue
        if (commit.test(line) && !/\bcore\.hooksPath=\/dev\/null\b/.test(line))
          violations.push(`${label}: commit must use -c core.hooksPath=/dev/null`)
        if (push.test(line) && !/\bcore\.hooksPath=\/dev\/null\b/.test(line))
          violations.push(`${label}: branch update must use -c core.hooksPath=/dev/null`)
      }
      if (/\bnpx --yes skills update\b/.test(step.run ?? '') && !step.env?.GH_TOKEN)
        violations.push(`${label}: skills update needs GH_TOKEN`)
      // The Codecov upload job holds OIDC and runs no repository action code; it is non-gating.
      if (step.uses?.startsWith('actions/download-artifact@') && slug !== 'ci-upload-codecov')
        violations.push(
          `${label}: use ./.github/actions/download-artifact; the upstream action stays alive after success (#5453)`,
        )
      if (step.uses === './.github/actions/download-artifact') {
        for (const key of ['github-token', 'repository', 'run-id']) {
          if (!step.with?.[key]) violations.push(`${label}: download-artifact must set ${key}`)
        }
      }
      const run = step.run ?? ''
      if (run.includes('gh run list') && run.includes('--workflow') && run.includes('--commit'))
        violations.push(
          `${label}: idle-polls a sibling workflow via gh run list --workflow --commit`,
        )
      if (
        run.includes('ci/wait-for-workflow-run.mts') ||
        run.includes('ci/wait-for-capability.mts')
      )
        violations.push(`${label}: reintroduces a cross-workflow deploy-order wait`)
    }
  }
  return violations
}

/** The base-owned dequeue handler is the only privileged PR-target workflow. */
export function privilegedWorkflowViolations(workflows: Record<string, SafetyWorkflow>): string[] {
  const actual = Object.entries(workflows)
    .flatMap(([path, workflow]) =>
      workflowHasTrigger(workflow.on, 'pull_request_target')
        ? [path.replace(/^\.github\/workflows\//, '')]
        : [],
    )
    .toSorted()
  const expected = ['cancel-dequeued-merge-group-runs.yml']
  return actual.length === expected.length &&
    actual.every((path, index) => path === expected[index])
    ? []
    : [
        `Privileged workflows must be cancel-dequeued-merge-group-runs.yml; found ${actual.join(', ')}`,
      ]
}
