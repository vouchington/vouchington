/**
 * Regenerates the workflow -> job -> runner -> timeout table in
 * .github/workflows/JOBS.md from the live `no-mistakes` workflow topology (`loadRepoTopology()`)
 * -- never by parsing workflow YAML directly, so this inventory can never drift out of sync with
 * the same source no-mistakes's own CI policies use (see
 * .github/workflows/workflow-topology-policy-inventory.mts for a sibling consumer). Mirrors
 * ci/vitest/generate-ownership-table.mts: splice a generated region between markers, delegate
 * final formatting to oxfmt's `format()` API so table padding never drifts from `oxfmt --check`.
 *
 * WORKFLOWS.md and its reference-*.md siblings are hand-curated, workflow-level summaries
 * ("inherited via uses + `[self-hosted]`"). JOBS.md is the generated, job-level ground truth --
 * the exact `runs-on` and `timeout-minutes` no-mistakes resolved for every job, plus a runner
 * category and exception rationale derived from that same `runs-on` value (see classifyRunner) --
 * never by re-deriving category/rationale from workflow YAML either. Remote reusable-workflow
 * call targets omit the `@ref` pin so a Dependabot SHA bump does not require regenerating
 * markdown; pins stay in the workflow YAML.
 *
 * Usage:
 *   node ci/render-workflow-runner-inventory.mts          # write
 *   node ci/render-workflow-runner-inventory.mts --check  # verify only, exit non-zero if stale
 *
 * Live `--check` runs from `ci/check-live-workflow-topology.mts` in static-code-analysis.yml,
 * after `no-mistakes check`, so it serializes on the same machine-wide lock. Vitest tests pass a
 * synthetic topology and never call `loadRepoTopology()`.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { format } from 'oxfmt'
import type { WorkflowJobNode, WorkflowRunsOn, WorkflowTopology } from 'no-mistakes'

import { loadRepoTopology } from './repo-topology.mts'
import { classifyRunner } from './runner-classification.mts'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.join(import.meta.dirname, '..')
const DEFAULT_DOC_PATH = path.join(ROOT, '.github/workflows/JOBS.md')

const BEGIN = '<!-- BEGIN GENERATED: workflow-job-runner-inventory -->'
const END = '<!-- END GENERATED -->'

const WORKFLOWS_PREFIX = '.github/workflows/'
const DEFAULT_TIMEOUT_MINUTES = 360

export function shortWorkflowPath(workflowId: string): string {
  return workflowId.startsWith(WORKFLOWS_PREFIX)
    ? workflowId.slice(WORKFLOWS_PREFIX.length)
    : workflowId
}

/** Drop the `uses:` `@ref` so generated markdown does not copy Dependabot-owned pins. */
function unpinnedCallTarget(target: string): string {
  return shortWorkflowPath(target.replace(/^\.\//, '').replace(/@[^@]+$/, ''))
}

// `runs-on:` can be an unevaluated `${{ ... }}` expression (e.g. the CodeBuild/ubicloud ternary in
// build-backend.yml), which authors wrap across lines and use `||` inside. Collapse to one line
// and escape `|` so it can never break out of its Markdown table cell.
function markdownTableCell(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\|/g, String.raw`\|`)
}

function renderRunsOn(runsOn: WorkflowRunsOn): string {
  if (typeof runsOn === 'string') return `\`${markdownTableCell(runsOn)}\``
  if (Array.isArray(runsOn))
    return runsOn.map(label => `\`${markdownTableCell(label)}\``).join(', ')
  if (runsOn.labels === undefined) return `group: \`${markdownTableCell(runsOn.group)}\``
  const labels = Array.isArray(runsOn.labels) ? runsOn.labels : [runsOn.labels]
  return `group: \`${markdownTableCell(runsOn.group)}\` (labels: ${labels.map(label => `\`${markdownTableCell(label)}\``).join(', ')})`
}

/** Builds a jobId -> reusable-workflow-call-target index once, so per-job lookup is O(1). */
function indexCallEdgeTargets(edges: WorkflowTopology['edges']): Map<string, string> {
  const targets = new Map<string, string>()
  for (const edge of edges) {
    if (edge.kind === 'calls') targets.set(edge.from, edge.target)
  }
  return targets
}

/**
 * Jobs with no `runs-on` delegate to a reusable workflow via `uses:` -- the callee's own jobs
 * carry the real runners. Every no-runsOn job the live topology emits has exactly one outgoing
 * `calls` edge (verified against the full repo topology while building this renderer). A job
 * matching neither shape means no-mistakes's schema changed underneath this renderer, so fail
 * loudly rather than render a misleading blank cell.
 */
function renderRunner(job: WorkflowJobNode, callEdgeTargets: Map<string, string>): string {
  if (job.runsOn !== undefined) {
    if (typeof job.runsOn === 'string' && job.runsOn.includes('codebuild-'))
      return '`optional managed build-image runner`'
    return renderRunsOn(job.runsOn)
  }
  const target = callEdgeTargets.get(job.id)
  if (target === undefined) {
    throw new Error(
      `${job.id} has no runs-on and no reusable-workflow call edge -- no-mistakes topology shape changed`,
    )
  }
  return `→ \`${unpinnedCallTarget(target)}\``
}

function generateInventoryTable(topology: WorkflowTopology): string {
  const callEdgeTargets = indexCallEdgeTargets(topology.edges)
  const rows = topology.jobs
    .toSorted((a, b) => a.workflowId.localeCompare(b.workflowId) || a.key.localeCompare(b.key))
    .map(job => {
      const kind = job.kind === 'matrix-template' ? 'matrix' : 'job'
      const timeout = job.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES
      const runner = renderRunner(job, callEdgeTargets)
      const inferredClassification = classifyRunner(job)
      const classification =
        typeof job.runsOn === 'string' && job.runsOn.includes('codebuild-')
          ? {
              category: 'Optional managed runner / ephemeral',
              rationale: `Optional managed runner for image builds; otherwise ephemeral runner.`,
            }
          : inferredClassification
      return (
        `| \`${shortWorkflowPath(job.workflowId)}\` | \`${job.key}\` | ${kind} | ${runner} | ` +
        `${markdownTableCell(classification.category)} | ${markdownTableCell(classification.rationale)} | ${timeout} |`
      )
    })
  return [
    '| Workflow | Job | Kind | Runner | Category | Exception Rationale | Timeout (min) |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function spliceGeneratedRegion(existing: string, table: string): string {
  const beginIdx = existing.indexOf(BEGIN)
  const endIdx = existing.indexOf(END)
  if (beginIdx === -1 || endIdx === -1) {
    throw new Error(`JOBS.md is missing the ${BEGIN} / ${END} markers`)
  }
  const before = existing.slice(0, beginIdx + BEGIN.length)
  const after = existing.slice(endIdx)
  return `${before}\n\n${table}\n\n${after}`
}

async function formatWithOxfmt(filePath: string, raw: string): Promise<string> {
  const result = await format(filePath, raw)
  if (result.errors.length > 0) {
    throw new Error(
      `oxfmt failed to format ${filePath}:\n${result.errors.map(err => err.message).join('\n')}`,
    )
  }
  return result.code
}

/** Pure render step, exposed for tests: splice the current table into `existing` and format it. */
export async function renderJobsInventoryDoc(
  existing: string,
  topology: WorkflowTopology,
  docPath = DEFAULT_DOC_PATH,
): Promise<string> {
  return formatWithOxfmt(docPath, spliceGeneratedRegion(existing, generateInventoryTable(topology)))
}

export async function writeJobsInventoryDoc({
  check = false,
  docPath = DEFAULT_DOC_PATH,
  topology,
}: { check?: boolean; docPath?: string; topology?: WorkflowTopology } = {}): Promise<void> {
  const resolved = topology ?? (await loadRepoTopology())
  const existing = readFileSync(docPath, 'utf8')
  const formatted = await renderJobsInventoryDoc(existing, resolved, docPath)

  if (!check) {
    writeFileSync(docPath, formatted)
    return
  }

  if (existing !== formatted) {
    throw new Error(
      `${docPath} is stale. Regenerate it by running ` +
        '`node ci/render-workflow-runner-inventory.mts` and commit the result.',
    )
  }
}

/* v8 ignore start -- direct-execution entry; live check is ci/check-live-workflow-topology.mts.
   writeJobsInventoryDoc (the testable half) is covered in render-workflow-runner-inventory.test.mts. */
if (process.argv?.[1] && realpathSync(process.argv[1]) === __filename) {
  const check = process.argv.includes('--check')
  try {
    await writeJobsInventoryDoc({ check })
    console.log(check ? 'JOBS.md is up to date.' : 'JOBS.md written.')
    process.exit(0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
/* v8 ignore stop */
