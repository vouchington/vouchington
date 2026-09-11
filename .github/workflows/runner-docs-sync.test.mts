import { readdirSync, readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from './workflow-test-helpers.mts'

type Workflow = {
  jobs?: Record<
    string,
    {
      'runs-on'?: string | string[]
    }
  >
}

const workflowPaths = readdirSync('.github/workflows').flatMap(file =>
  file.endsWith('.yml') || file.endsWith('.yaml') ? [`.github/workflows/${file}`] : [],
)

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

function collectRunsOnTokens(): Set<string> {
  const tokens = new Set<string>()
  for (const path of workflowPaths) {
    const workflow = readWorkflow(path)
    for (const job of Object.values(workflow.jobs ?? {})) {
      const runsOn = job['runs-on']
      if (runsOn == null) continue
      const labels = Array.isArray(runsOn) ? runsOn : [runsOn]
      for (const label of labels) {
        if (typeof label !== 'string') continue
        // Skip dynamic expressions — they cannot be statically matched against docs
        if (label.includes('${{')) continue
        tokens.add(label)
      }
    }
  }
  return tokens
}

function runnerTypesSection(): string {
  return readFileSync('.github/workflows/reference-runner-types.md', 'utf8')
}

function collectDocumentedTokens(section: string): Set<string> {
  const documented = new Set<string>()
  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('- `')) {
      // Split on em-dash or double-hyphen separating the label from its description.
      // Use a regex so bullets that use ' -- ' instead of ' — ' are handled too.
      const labelPart = trimmed.split(/\s—\s|\s--\s/)[0]!
      const matches = labelPart.matchAll(/`([^`]+)`/g)
      for (const match of matches) {
        const tokens = match[1]!.split(',').map(t => t.trim())
        for (const token of tokens) {
          documented.add(token)
        }
      }
    }
  }
  return documented
}

function readWorkflowDocumentation(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('runner-docs-sync', () => {
  // Note: this test is intentionally token-level, not combination-level.
  // It asserts that every individual label token that appears in a `runs-on`
  // array is documented somewhere in RUNNERS.md § Runner Types — not that each
  // specific runner combination has its own bullet. Combination-level coverage
  // is enforced by `runner-policy.test.mts` and `ephemeral-runner-policy.test.mts`.
  it('every runs-on label token used in workflows appears in RUNNERS.md § Runner Types', () => {
    const tokens = collectRunsOnTokens()
    const runnersIndex = readFileSync('.github/workflows/RUNNERS.md', 'utf8')
    const section = runnerTypesSection()
    const documented = collectDocumentedTokens(section)
    const missing: string[] = []

    expect(runnersIndex).toContain('[Runner Types](reference-runner-types.md)')
    expect(readWorkflowDocumentation('.github/workflows/CLAUDE.md')).toContain(
      '[Workflow Runner Types](reference-runner-types.md)',
    )

    for (const token of tokens) {
      if (!documented.has(token)) {
        missing.push(token)
      }
    }

    assertNoWorkflowViolations(
      missing.map(token => `  ${token}`),
      'runs-on tokens used in workflows but absent from RUNNERS.md § Runner Types:\nAdd a bullet for each missing token to .github/workflows/RUNNERS.md § Runner Types.',
    )
  })

  it('keeps runner-type capacity guidance live rather than fleet-count snapshots', () => {
    const runnerTypes = runnerTypesSection()
    const workflowGuide = readWorkflowDocumentation('.github/workflows/CLAUDE.md')
    const runnerDocs = [runnerTypes, workflowGuide]
    expect(runnerTypes).toContain(
      '[Runner Fleet Capacity live-capacity procedure](reference-runner-fleet-capacity.md)',
    )
    expect(workflowGuide).toContain('`[self-hosted]`')
    expect(workflowGuide.replace(/\s+/gu, ' ')).toContain(
      '[Runner Fleet Capacity live-capacity procedure](reference-runner-fleet-capacity.md)',
    )
    for (const text of runnerDocs) expect(text).not.toMatch(/\b(?:23-host|17 Linux|6 macOS)\b/u)
  })

  it('keeps extracted PR Shepherd safety contracts in their canonical leaves', () => {
    const isolation = readWorkflowDocumentation(
      '.github/workflows/reference-self-hosted-runner-secret-isolation-accepted-residuals-7572.md',
    )
    const acceptedRisk = readWorkflowDocumentation(
      '.github/workflows/reference-harness-automation-accepted-risk.md',
    )
    const standalone = readFileSync(
      'docs/development/reference-ci-standalone-workflow-checks.md',
      'utf8',
    )

    expect(isolation).toContain('[Harness dispatcher](harness-dispatch.yml)')
    expect(isolation).toContain('unset-by-default')
    expect(acceptedRisk).toContain('`HARNESS_DISPATCH_ENABLED`')
    expect(acceptedRisk).toContain('`HARNESS_URL`')
    expect(acceptedRisk).toContain('`POST /repositories/:id/drain`')
    expect(standalone).toContain("`vars.HARNESS_DISPATCH_ENABLED == 'true'`")
    expect(standalone).toContain('harness-dispatch-fleet-admission')
    expect(standalone).toContain('`HARNESS_API_KEY`')
  })

  it('keeps coverage transport and CI-tooling isolation contracts in runner leaves', () => {
    const caching = readWorkflowDocumentation(
      '.github/workflows/reference-self-hosted-runner-caching.md',
    )
    const isolation = readWorkflowDocumentation(
      '.github/workflows/reference-self-hosted-runner-secret-isolation.md',
    )

    expect(caching).toContain('dependency/platform fingerprint')
    expect(isolation).toContain('`id-token: write`')
    expect(isolation).toContain('`actions: read`/`actions: write`')
    expect(isolation).not.toContain('`test-ts-shared`, `test-tooling`')
  })
})
