import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import {
  assertNoWorkflowViolations,
  gitSubcommandPattern,
  requiredNamedStep,
  shellLogicalLines,
  type WorkflowJob,
  type WorkflowStep,
} from './workflow-test-helpers.mts'

const PR_BASE_SHA = '${{ github.event.pull_request.base.sha }}'
const PR_HEAD_SHA = '${{ github.event.pull_request.head.sha }}'
const MERGE_SHA = '${{ github.sha }}'

type WorkflowFile = {
  jobs?: Record<string, WorkflowJob & { steps?: WorkflowStep[] }>
}

function workflowFiles(): string[] {
  return readdirSync('.github/workflows')
    .filter(name => name.endsWith('.yml'))
    .map(name => join('.github/workflows', name))
    .toSorted()
}

function envVarsBoundTo(env: Record<string, string> | undefined, expression: string): string[] {
  if (!env) return []
  return Object.entries(env)
    .filter(([, value]) => value.trim() === expression)
    .map(([name]) => name)
}

function envUsesVar(script: string, name: string): boolean {
  return (
    script.includes(`$${name}`) ||
    script.includes(`\${${name}}`) ||
    script.includes(`"\${${name}}"`)
  )
}

function gitCompareLines(script: string): string[] {
  return shellLogicalLines(script).filter(
    line =>
      gitSubcommandPattern('diff').test(line) ||
      gitSubcommandPattern('merge-base').test(line) ||
      gitSubcommandPattern('log').test(line) ||
      gitSubcommandPattern('rev-list').test(line),
  )
}

function mixedPairViolations(path: string): string[] {
  const workflow = load(readFileSync(path, 'utf8')) as WorkflowFile
  const violations: string[] = []
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    for (const [index, step] of (job.steps ?? []).entries()) {
      const label = `${path}#${jobId} step ${step.name ?? step.id ?? String(index)}`
      const baseVars = envVarsBoundTo(step.env, PR_BASE_SHA)
      const mergeVars = envVarsBoundTo(step.env, MERGE_SHA)
      if (
        step.env?.['TOPOLOGY_BASE_SHA'] === PR_BASE_SHA &&
        step.env?.['TOPOLOGY_HEAD_SHA'] === MERGE_SHA
      ) {
        violations.push(
          `${label}: TOPOLOGY_BASE_SHA is pull_request.base.sha while TOPOLOGY_HEAD_SHA is github.sha`,
        )
      }
      const script = step.run
      if (!script || baseVars.length === 0 || mergeVars.length === 0) continue
      for (const line of gitCompareLines(script)) {
        const usesBase = baseVars.some(name => envUsesVar(line, name))
        const usesMerge = mergeVars.some(name => envUsesVar(line, name))
        if (usesBase && usesMerge) {
          violations.push(
            `${label}: git compare mixes pull_request.base.sha with github.sha (${line.trim()})`,
          )
        }
      }
    }
  }
  return violations
}

describe('PR compare revision pairs', () => {
  it('never diffs pull_request.base.sha against github.sha', () => {
    assertNoWorkflowViolations(workflowFiles().flatMap(mixedPairViolations))
  })

  it('keeps select-ci topology on pair 2 instead of workflow-injected SHAs', () => {
    const workflow = load(
      readFileSync('.github/workflows/ci-select-vitest.yml', 'utf8'),
    ) as WorkflowFile
    const step = requiredNamedStep(workflow.jobs?.['select-ci'], 'Select Vitest tests')
    expect(step.env).not.toHaveProperty('TOPOLOGY_BASE_SHA')
    expect(step.env).not.toHaveProperty('TOPOLOGY_HEAD_SHA')
  })

  it('classifies docs-only PRs with origin/<base_ref>...HEAD', () => {
    const workflow = load(
      readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8'),
    ) as WorkflowFile
    const step = requiredNamedStep(workflow.jobs?.['detect-changes'], 'Check for docs-only changes')
    expect(step.env).toEqual({ PR_BASE_REF: '${{ github.base_ref }}' })
    expect(step.run).toContain('"origin/${PR_BASE_REF}...HEAD"')
    expect(step.run).not.toContain('github.event.pull_request.base.sha')
    expect(step.run).not.toContain('github.sha')
  })

  it('compares postgres index renames against origin/<base_ref>, not pull_request.base.sha', () => {
    const workflow = load(
      readFileSync('.github/workflows/tests-postgres-schema.yml', 'utf8'),
    ) as WorkflowFile
    const step = requiredNamedStep(
      workflow.jobs?.['postgres-schema-tests'],
      'Check for renamed PostgreSQL indexes',
    )
    expect(step.env?.['PR_BASE_SHA']).toBe(
      "${{ github.base_ref && format('origin/{0}', github.base_ref) || 'origin/main' }}",
    )
    expect(step.env?.['PR_BASE_SHA']).not.toContain('pull_request.base.sha')
  })

  it('keeps gitleaks PR scans on pair 1', () => {
    const workflow = load(readFileSync('.github/workflows/gitleaks.yml', 'utf8')) as WorkflowFile
    const step = requiredNamedStep(workflow.jobs?.['gitleaks'], 'Determine Gitleaks scan range')
    expect(step.env?.['PR_BASE_SHA']).toBe(PR_BASE_SHA)
    expect(step.env?.['PR_HEAD_SHA']).toBe(PR_HEAD_SHA)
    expect(step.run).toContain('git merge-base "$PR_BASE_SHA" "$PR_HEAD_SHA"')
  })
})
