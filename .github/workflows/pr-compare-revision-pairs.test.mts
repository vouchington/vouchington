import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
} from '../test-helpers/workflow-fixtures.mts'

const PR_BASE_SHA = '${{ github.event.pull_request.base.sha }}'
const PR_HEAD_SHA = '${{ github.event.pull_request.head.sha }}'
const MERGE_SHA = '${{ github.sha }}'

type WorkflowFile = {
  jobs?: Record<string, WorkflowJob & { steps?: WorkflowStep[] }>
}

type PathsFilterStep = WorkflowStep & { with?: Record<string, string> }

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

  it('pins one merge-queue range and reuses it for docs and both path filters', () => {
    const workflow = load(
      readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8'),
    ) as WorkflowFile
    const range = requiredNamedStep(
      workflow.jobs?.['detect-changes'],
      'Resolve merge queue diff range',
    )
    const step = requiredNamedStep(workflow.jobs?.['detect-changes'], 'Check for docs-only changes')
    expect(step.env).toEqual({
      EVENT_NAME: '${{ github.event_name }}',
      MERGE_QUEUE_BASE_SHA: '${{ steps.merge-queue-range.outputs.base }}',
      MERGE_QUEUE_HEAD_SHA: '${{ steps.merge-queue-range.outputs.head }}',
      PR_BASE_REF: '${{ github.base_ref }}',
    })
    expect(range.if).toBe("github.event_name == 'merge_group'")
    expect(range.run).toContain('git rev-parse HEAD')
    expect(range.run).toContain('git merge-base origin/main "$HEAD_SHA"')
    expect(step.run).toContain(
      'git diff --name-only "$MERGE_QUEUE_BASE_SHA" "$MERGE_QUEUE_HEAD_SHA"',
    )
    expect(step.run).toContain('"origin/${PR_BASE_REF}...HEAD"')
    const steps = (workflow.jobs?.['detect-changes']?.steps ?? []) as PathsFilterStep[]
    const filters = steps.filter(candidate => candidate.uses?.startsWith('dorny/paths-filter@'))
    expect(filters).toHaveLength(2)
    for (const filter of filters) {
      expect(filter.with).toMatchObject({
        base: '${{ steps.merge-queue-range.outputs.base }}',
        ref: '${{ steps.merge-queue-range.outputs.head }}',
      })
    }
  })

  it('includes earlier queued commits in the docs-only decision', () => {
    const workflow = load(
      readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8'),
    ) as WorkflowFile
    const range = requiredNamedStep(
      workflow.jobs?.['detect-changes'],
      'Resolve merge queue diff range',
    )
    const step = requiredNamedStep(workflow.jobs?.['detect-changes'], 'Check for docs-only changes')
    const directory = mkdtempSync(join(tmpdir(), 'merge-group-docs-'))
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
    try {
      git('init', '-q')
      git('config', 'user.name', 'CI Test')
      git('config', 'user.email', 'ci-test@example.invalid')
      writeFileSync(join(directory, 'README.md'), 'base\n')
      git('add', '.')
      git('commit', '-qm', 'base')
      const base = git('rev-parse', 'HEAD')
      git('branch', '-M', 'main')
      mkdirSync(join(directory, 'backend'))
      writeFileSync(join(directory, 'backend/queued.mts'), 'export const queued = true\n')
      git('add', '.')
      git('commit', '-qm', 'earlier queued backend change')
      const lastQueueEntryBase = git('rev-parse', 'HEAD')
      writeFileSync(join(directory, 'README.md'), 'documentation\n')
      git('add', '.')
      git('commit', '-qm', 'later docs entry')
      const head = git('rev-parse', 'HEAD')
      git('update-ref', 'refs/remotes/origin/main', base)
      const rangeOutput = join(directory, 'range-output')
      execFileSync('bash', ['-e', '-c', range.run ?? 'exit 1'], {
        cwd: directory,
        env: { ...process.env, GITHUB_OUTPUT: rangeOutput },
      })
      const rangeValues = Object.fromEntries(
        readFileSync(rangeOutput, 'utf8')
          .trim()
          .split('\n')
          .map(line => line.split('=')),
      )
      expect(rangeValues).toEqual({ base, head })
      expect(git('diff', '--name-only', lastQueueEntryBase, head)).toBe('README.md')
      expect(git('diff', '--name-only', rangeValues.base, rangeValues.head)).toBe(
        'README.md\nbackend/queued.mts',
      )
      const output = join(directory, 'output')
      execFileSync('bash', ['-e', '-c', step.run ?? 'exit 1'], {
        cwd: directory,
        env: {
          ...process.env,
          EVENT_NAME: 'merge_group',
          GITHUB_OUTPUT: output,
          MERGE_QUEUE_BASE_SHA: rangeValues.base,
          MERGE_QUEUE_HEAD_SHA: rangeValues.head,
          PR_BASE_REF: '',
        },
      })
      expect(readFileSync(output, 'utf8')).toContain('docs-only=false')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps gitleaks PR scans on pair 1', () => {
    const workflow = load(readFileSync('.github/workflows/gitleaks.yml', 'utf8')) as WorkflowFile
    const step = requiredNamedStep(workflow.jobs?.['gitleaks'], 'Determine Gitleaks scan range')
    expect(step.env?.['PR_BASE_SHA']).toBe(PR_BASE_SHA)
    expect(step.env?.['PR_HEAD_SHA']).toBe(PR_HEAD_SHA)
    expect(step.run).toContain('git merge-base "$PR_BASE_SHA" "$PR_HEAD_SHA"')
  })
})
