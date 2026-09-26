import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  assertNoWorkflowViolations,
  gitSubcommandPattern,
  shellLogicalLines,
  workflowHasTrigger,
} from '../test-helpers/workflow-test-helpers.mts'

type Step = {
  name?: string
  env?: Record<string, string>
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

type Job = { steps?: Step[] }

type Workflow = {
  name?: string
  on?: unknown
  jobs?: Record<string, Job>
}

const workflowPaths = readdirSync('.github/workflows').flatMap(file =>
  file.endsWith('.yml') || file.endsWith('.yaml') ? [`.github/workflows/${file}`] : [],
)

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

function workflowSlug(path: string): string {
  return path.replace(/^\.github\/workflows\//, '').replace(/\.ya?ml$/, '')
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function getMermaidDiagrams(reference: string): string[] {
  return [...reference.matchAll(/```mermaid\n([\s\S]*?)\n```/g)].map(match => match[1]!)
}

function getMermaidNodeIds(references: string[]): Set<string> {
  return new Set(
    references.flatMap(reference =>
      getMermaidDiagrams(reference).flatMap(diagram =>
        [...diagram.matchAll(/(?:^|\s)([a-z][a-z0-9-]*)\[/g)].map(match => match[1]!),
      ),
    ),
  )
}

const automationMapLeaves = [
  'reference-workflow-automation-always-run.md',
  'reference-workflow-automation-pull-requests.md',
  'reference-workflow-automation-main.md',
]

function getInventoryWorkflowNames(reference: string): string[] {
  return reference
    .split('\n')
    .filter(line => line.startsWith('| [') || line.startsWith('| **'))
    .map(line => {
      const workflowCell = line.split('|')[1] ?? ''
      return normalize(workflowCell.match(/\[([^\]]+)\]/)?.[1] ?? workflowCell)
    })
}

function stepLabel(path: string, jobId: string, step: Step, index: number): string {
  return `${workflowSlug(path)}#${jobId} step ${step.name ?? index}`
}

describe('workflow automation safety', () => {
  it('routes operational policies to focused workflow references', () => {
    const readme = readFileSync('.github/workflows/README.md', 'utf8')
    const codexAutomation = readFileSync(
      '.github/workflows/reference-harness-automation.md',
      'utf8',
    )
    const dependencyPolicy = readFileSync(
      '.github/workflows/reference-fix-main-dependency-policy.md',
      'utf8',
    )
    const workflowPreflight = readFileSync(
      '.github/workflows/reference-workflow-change-preflight.md',
      'utf8',
    )
    expect(readme).toContain('[Auto Harness automation](reference-harness-automation.md)')
    expect(readme).toContain('[Workflow change preflight](reference-workflow-change-preflight.md)')
    expect(codexAutomation).toContain('## Configuration and activation')
    expect(codexAutomation).toContain('[Fix Main](fix-main.yml)')
    expect(dependencyPolicy).toContain(
      '[Back to Auto Harness automation](reference-harness-automation.md)',
    )
    expect(dependencyPolicy).toContain('[Back to Workflow Reference](README.md)')
    expect(workflowPreflight).toContain('## Workflow Reference Hygiene')
  })

  it('disables local hooks for fixed-branch automation commit and branch update steps', () => {
    const commitPattern = gitSubcommandPattern('commit')
    const branchUpdatePattern = gitSubcommandPattern('push')
    const violations: string[] = []

    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        for (const [index, step] of (job.steps ?? []).entries()) {
          if (!step.run) continue
          const label = stepLabel(path, jobId, step, index)
          for (const line of shellLogicalLines(step.run)) {
            if (/^\s*#/.test(line)) continue
            if (commitPattern.test(line) && !/\bcore\.hooksPath=\/dev\/null\b/.test(line)) {
              violations.push(`${label}: commit must use -c core.hooksPath=/dev/null`)
            }
            if (branchUpdatePattern.test(line) && !/\bcore\.hooksPath=\/dev\/null\b/.test(line)) {
              violations.push(`${label}: branch update must use -c core.hooksPath=/dev/null`)
            }
          }
        }
      }
    }

    assertNoWorkflowViolations(violations)
  })

  it('passes GH_TOKEN to scheduled GitHub-backed updater CLIs', () => {
    const violations: string[] = []

    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        for (const [index, step] of (job.steps ?? []).entries()) {
          if (!/\bnpx --yes skills update\b/.test(step.run ?? '')) continue
          if (step.env?.['GH_TOKEN']) continue
          violations.push(`${stepLabel(path, jobId, step, index)}: skills update needs GH_TOKEN`)
        }
      }
    }

    assertNoWorkflowViolations(violations)
  })

  it('pins artifact downloads to an explicit token, repository, and run id', () => {
    // Allowlist intentional same-attempt diagnostic downloads (no token/repository/run-id).
    // Entries use the `stepLabel` form, e.g. `tests#fan-in step Download failed shards`.
    const sameAttemptDiagnosticAllowlist = new Set<string>()
    const violations: string[] = []
    const checkDownload = (label: string, step: Step): void => {
      if (!step.uses?.startsWith('actions/download-artifact@')) return
      if (sameAttemptDiagnosticAllowlist.has(label)) return
      for (const key of ['github-token', 'repository', 'run-id']) {
        if (step.with?.[key]) continue
        violations.push(`${label}: actions/download-artifact must set ${key}`)
      }
    }

    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        for (const [index, step] of (job.steps ?? []).entries()) {
          checkDownload(stepLabel(path, jobId, step, index), step)
        }
      }
    }
    assertNoWorkflowViolations(violations)
  })

  it('keeps every workflow in a grouped inventory reference and standalone workflows in the automation-map leaf Mermaid diagrams', () => {
    const readme = readFileSync('.github/workflows/README.md', 'utf8')
    const workflowReference = readFileSync('.github/workflows/WORKFLOWS.md', 'utf8')
    const automationMap = readFileSync(
      '.github/workflows/reference-workflow-automation-map.md',
      'utf8',
    )
    const workflowInstructions = readFileSync('.github/workflows/CLAUDE.md', 'utf8')
    const fixedBranchAutomation = readFileSync(
      '.github/workflows/reference-fixed-branch-automation-prs.md',
      'utf8',
    )
    const githubActionsChecklist = readFileSync('docs/checklists/github-actions.md', 'utf8')
    const inventoryReferences = [
      'reference-core-ci.md',
      'reference-vitest.md',
      'reference-playwright-and-storybook.md',
      'reference-deploy-and-release.md',
      'reference-harness-automation.md',
      'reference-maintenance-security-and-utilities.md',
    ]
    const inventoryWorkflowNames = getInventoryWorkflowNames(
      inventoryReferences.map(path => readFileSync(`.github/workflows/${path}`, 'utf8')).join('\n'),
    )
    const leaves = automationMapLeaves.map(leaf =>
      readFileSync(`.github/workflows/${leaf}`, 'utf8'),
    )
    const mermaidNodeIds = getMermaidNodeIds(leaves)
    const inventoryMissing: string[] = []
    const mermaidMissing: string[] = []
    expect(readme).toContain('[Workflow automation map](reference-workflow-automation-map.md)')
    expect(workflowReference).toContain(
      '[Workflow automation map](reference-workflow-automation-map.md)',
    )
    expect(getMermaidDiagrams(readme)).toEqual([])
    expect(getMermaidDiagrams(workflowReference)).toEqual([])
    expect(automationMap).toContain('[Back to Workflow Reference](README.md)')
    expect(automationMap).toContain('[Back to Workflow inventory](WORKFLOWS.md)')
    expect(getMermaidDiagrams(automationMap)).toEqual([])
    for (const [index, leaf] of automationMapLeaves.entries()) {
      expect(automationMap).toContain(`](${leaf})`)
      expect(leaves[index]).toContain(
        '[Back to Workflow automation map](reference-workflow-automation-map.md)',
      )
      expect(getMermaidDiagrams(leaves[index]!)).toHaveLength(1)
    }
    expect(workflowInstructions).toContain(
      '[Workflow automation map](reference-workflow-automation-map.md)',
    )
    expect(fixedBranchAutomation).toMatch(
      /\[Workflow automation\s+map\]\(reference-workflow-automation-map\.md\)/u,
    )
    expect(githubActionsChecklist).toMatch(
      /\[Workflow automation\s+map\]\(\.\.\/\.\.\/\.github\/workflows\/reference-workflow-automation-map\.md\)/u,
    )
    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      const slug = normalize(workflowSlug(path))
      const workflowName = normalize(workflow.name ?? '')
      const hasTableRow = inventoryWorkflowNames.some(
        name => name === slug || (workflowName.length > 0 && name === workflowName),
      )
      if (!hasTableRow) {
        inventoryMissing.push(`${workflowSlug(path)}: missing grouped inventory reference row`)
      }
      if (workflowHasTrigger(workflow.on, 'workflow_call')) continue
      if (!mermaidNodeIds.has(slug))
        mermaidMissing.push(`${workflowSlug(path)}: missing mermaid node`)
    }
    assertNoWorkflowViolations([...inventoryMissing, ...mermaidMissing])
  })
})
