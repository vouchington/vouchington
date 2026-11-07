import { parse as parseYaml } from 'yaml'

interface Workflow {
  jobs?: Record<
    string,
    {
      env?: Record<string, unknown>
      steps?: Array<{ env?: Record<string, unknown>; run?: string }>
    }
  >
}

const coverageWorkflowPaths = [
  '.github/workflows/tests-backend-modules.yml',
  '.github/workflows/tests-tooling.yml',
  '.github/workflows/tests-ts-shared.yml',
  '.github/workflows/tests-portability.yml',
  '.github/workflows/tests-lambdas.yml',
  '.github/workflows/tests-cloudflare-worker.yml',
  '.github/workflows/tests-web.yml',
  '.github/workflows/tests-web-api.yml',
  '.github/workflows/tests-web-integration.yml',
] as const

const webProjectConfig = 'test-helpers/vitest-config/web-projects.mts'

function workflowSources(sources: Readonly<Record<string, string>>): Array<[string, string]> {
  return Object.entries(sources).filter(
    ([path]) => path.startsWith('.github/workflows/') && /\.ya?ml$/u.test(path),
  )
}

function commands(source: string): string[] {
  const workflow = parseYaml(source) as Workflow
  return Object.values(workflow.jobs ?? {}).flatMap(job =>
    (job.steps ?? []).flatMap(step => (typeof step.run === 'string' ? [step.run] : [])),
  )
}

function hasCoverageGate(source: string): boolean {
  const workflow = parseYaml(source) as Workflow
  return Object.values(workflow.jobs ?? {}).some(job =>
    [job.env, ...(job.steps ?? []).map(step => step.env)].some(
      env => env?.VITEST_COVERAGE_ENABLED === "${{ inputs.publish_coverage && 'true' || 'false' }}",
    ),
  )
}

/** Check finite Vitest workflow command and ownership policy from caller-supplied source text. */
export function vitestProjectCommandPolicyViolations(
  sources: Readonly<Record<string, string>>,
  toolingWorkflowProjectNames: readonly string[],
): string[] {
  const violations: string[] = []
  const get = (path: string): string | undefined => sources[path]
  const requireSource = (path: string): string | undefined => {
    const source = get(path)
    if (source === undefined)
      violations.push(`${path} is missing from Vitest project command inputs`)
    return source
  }

  const checklist = requireSource('docs/checklists/github-actions.md')
  if (
    checklist !== undefined &&
    !checklist.includes('`pnpm exec vitest run --project github-actions`')
  ) {
    violations.push('GitHub Actions checklist must document the github-actions Vitest command')
  }
  const workflowInstructions = requireSource('.github/workflows/AGENTS.md')
  if (
    workflowInstructions !== undefined &&
    !workflowInstructions.includes('../../docs/checklists/github-actions.md#checklist')
  ) {
    violations.push('workflow instructions must reference the canonical GitHub Actions checklist')
  }
  if (
    workflowInstructions !== undefined &&
    workflowInstructions.includes('pnpm exec vitest run --project github-actions')
  ) {
    violations.push('workflow instructions must defer the github-actions command to the checklist')
  }

  const workflowEntries = workflowSources(sources)
  if (workflowEntries.length === 0) violations.push('No workflow YAML inputs were provided')
  const fileFilter = /(?:^|\s)[^\s]+\.(?:mock\.)?test\.[cm]?[jt]sx?(?:\s|$)/u
  for (const [path, source] of workflowEntries) {
    for (const command of commands(source)) {
      if (command.includes('vitest run') && fileFilter.test(command)) {
        violations.push(`${path} has a Vitest command selecting an individual test file`)
      }
    }
  }

  for (const path of coverageWorkflowPaths) {
    const source = requireSource(path)
    if (source === undefined) continue
    if (
      !source.includes(
        "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
      ) ||
      !hasCoverageGate(source)
    )
      violations.push(`${path} must gate coverage on publish_coverage`)
    if (/(?:vitest run|test:portability).*--coverage/u.test(source))
      violations.push(`${path} must gate Vitest coverage through its environment, not CLI flags`)
  }

  const toolingWorkflow = requireSource('.github/workflows/tests-tooling.yml')
  if (
    toolingWorkflow !== undefined &&
    !toolingWorkflow.includes('tooling-test-runner.mts --workflow-projects')
  ) {
    violations.push('tests-tooling must use the tooling workflow project runner')
  }
  if (!toolingWorkflowProjectNames.includes('static-analysis-ast-grep')) {
    violations.push('the tooling workflow project registry must contain static-analysis-ast-grep')
  }

  const portability = requireSource('.github/workflows/tests-portability.yml')
  if (portability !== undefined) {
    const invocations = portability.match(/pnpm run test:portability -- --bail=3/g) ?? []
    if (invocations.length !== 1)
      violations.push('tests-portability must invoke its suite exactly once')
    const setupAction =
      portability.match(
        /uses: vouchington\/vouchington-tooling\/\.github\/actions\/setup-node-pnpm@/g,
      ) ?? []
    if (setupAction.length !== 1) {
      violations.push('tests-portability must use the full-workspace setup action exactly once')
    }
    if (portability.includes('pnpm install ') || /\bpnpm install\b/u.test(portability)) {
      violations.push('tests-portability must not install inline outside the shared setup action')
    }
  }

  const projectGroups = requireSource('ci/run-vitest-project-group.mts')
  if (projectGroups !== undefined) {
    if (!projectGroups.includes("'lambdas-portability'")) {
      violations.push('the Vitest project groups must include lambdas-portability')
    }
    if (!projectGroups.includes("'cloudflare-worker-portability'")) {
      violations.push('the Vitest project groups must include cloudflare-worker-portability')
    }
  }

  const storybook = requireSource('.github/workflows/storybook.yml')
  if (
    storybook !== undefined &&
    !storybook.includes("STORYBOOK_BROWSER_COVERAGE: ${{ inputs.publish_coverage && '1' || '0' }}")
  ) {
    violations.push('Storybook browser coverage must be gated by publish_coverage')
  }

  for (const path of [
    '.github/ci-path-filters.yml',
    '.github/workflows/main-web.yml',
    '.github/workflows/main-storybook.yml',
  ]) {
    const source = requireSource(path)
    if (source !== undefined && !source.includes(webProjectConfig)) {
      violations.push(`${path} must route web Vitest project config changes`)
    }
  }

  return violations
}
