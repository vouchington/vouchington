import { gitSubcommandPattern, shellLogicalLines } from './workflow-shell-policy.mts'
import type { WorkflowDocuments, WorkflowSources } from './workflow-ops-policy.mts'

const prBaseSha = '${{ github.event.pull_request.base.sha }}'
const mergeSha = '${{ github.sha }}'

const extractedCiScripts = new Map<string, string>(
  ['merge-queue-range', 'docs-check', 'trusted-context', 'areas'].map(name => {
    const path = `.github/workflows/ci-detect-changes/${name}.sh`
    return [`source ${path}`, path] as const
  }),
)

function stepScript(run: string | undefined, sources: WorkflowSources): string | undefined {
  const path = run ? extractedCiScripts.get(run) : undefined
  if (!path) return run
  const source = sources[path]
  if (source === undefined) throw new Error(`Missing workflow revision script: ${path}`)
  return source
}

function includesValue(value: unknown, fragment: string): boolean {
  return typeof value === 'string' && value.includes(fragment)
}

function envVarsBoundTo(env: Record<string, unknown> | undefined, expression: string): string[] {
  if (!env) return []
  const names: string[] = []
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === 'string' && value.trim() === expression) names.push(name)
  }
  return names
}

function envUsesVar(script: string, name: string): boolean {
  return script.includes(`$${name}`) || script.includes(`\${${name}}`)
}

function gitCompareLines(script: string): string[] {
  return shellLogicalLines(script).filter(line =>
    ['diff', 'merge-base', 'log', 'rev-list'].some(subcommand =>
      gitSubcommandPattern(subcommand).test(line),
    ),
  )
}

/** Enforce that PR analysis uses a coherent pair of base and merge revisions. */
export function prRevisionPairViolations(
  workflows: WorkflowDocuments,
  sources: WorkflowSources,
): string[] {
  const violations: string[] = []
  for (const [path, workflow] of Object.entries(workflows)) {
    if (!path.startsWith('.github/workflows/') || !path.endsWith('.yml')) continue
    for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
      for (const [index, step] of (job.steps ?? []).entries()) {
        const label = `${path}#${jobId} step ${step.name ?? step.id ?? String(index)}`
        const baseVars = envVarsBoundTo(step.env, prBaseSha)
        const mergeVars = envVarsBoundTo(step.env, mergeSha)
        if (step.env?.TOPOLOGY_BASE_SHA === prBaseSha && step.env?.TOPOLOGY_HEAD_SHA === mergeSha) {
          violations.push(
            `${label}: TOPOLOGY_BASE_SHA is pull_request.base.sha while TOPOLOGY_HEAD_SHA is github.sha`,
          )
        }
        const script = stepScript(step.run, sources)
        if (!script || baseVars.length === 0 || mergeVars.length === 0) continue
        for (const line of gitCompareLines(script)) {
          if (
            baseVars.some(name => envUsesVar(line, name)) &&
            mergeVars.some(name => envUsesVar(line, name))
          ) {
            violations.push(
              `${label}: git compare mixes pull_request.base.sha with github.sha (${line.trim()})`,
            )
          }
        }
      }
    }
  }

  const workflow = workflows['.github/workflows/ci-detect-changes.yml']
  const job = workflow?.jobs?.['detect-changes']
  const range = job?.steps?.find(step => step.name === 'Resolve merge queue diff range')
  const docs = job?.steps?.find(step => step.name === 'Check for docs-only changes')
  const expectedEnv = {
    EVENT_NAME: '${{ github.event_name }}',
    MERGE_QUEUE_BASE_SHA: '${{ steps.merge-queue-range.outputs.base }}',
    MERGE_QUEUE_HEAD_SHA: '${{ steps.merge-queue-range.outputs.head }}',
  }
  const docsEnv = docs?.env
  if (
    !docsEnv ||
    Object.keys(docsEnv).length !== Object.keys(expectedEnv).length ||
    Object.entries(expectedEnv).some(([name, value]) => docsEnv[name] !== value)
  )
    violations.push('ci-detect-changes docs check must use the shared merge-queue base and head')
  if (range?.if !== "github.event_name == 'merge_group'")
    violations.push('ci-detect-changes merge queue range must run only for merge_group')
  if (!includesValue(stepScript(range?.run, sources), 'git rev-parse HEAD'))
    violations.push('ci-detect-changes must resolve the merge queue head from HEAD')
  if (!includesValue(stepScript(range?.run, sources), 'git merge-base origin/main "$HEAD_SHA"'))
    violations.push('ci-detect-changes must resolve the merge queue base from origin/main')
  if (
    !includesValue(
      stepScript(docs?.run, sources),
      'git diff --name-only "$MERGE_QUEUE_BASE_SHA" "$MERGE_QUEUE_HEAD_SHA"',
    )
  )
    violations.push('ci-detect-changes docs check must use the resolved base/head pair')
  const filters = job?.steps?.filter(step => step.uses?.startsWith('dorny/paths-filter@')) ?? []
  if (filters.length !== 2)
    violations.push('ci-detect-changes must have exactly two paths-filter steps')
  for (const [index, step] of filters.entries()) {
    if (
      step.with?.base !== '${{ steps.merge-queue-range.outputs.base }}' ||
      step.with?.ref !== '${{ steps.merge-queue-range.outputs.head }}'
    ) {
      violations.push(
        `ci-detect-changes paths-filter step ${index} must share the resolved base/head`,
      )
    }
  }
  if (!sources['.github/workflows/ci-detect-changes.yml'])
    violations.push('.github/workflows/ci-detect-changes.yml is missing')
  return violations
}
