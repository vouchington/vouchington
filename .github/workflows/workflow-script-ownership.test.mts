import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from '../test-helpers/workflow-test-helpers.mts'

type WorkflowStep = {
  run?: string
  with?: { command?: string; filters?: string }
}

type WorkflowJob = {
  steps?: WorkflowStep[]
}

type Workflow = {
  on?: unknown
  jobs?: Record<string, WorkflowJob> & {
    'detect-changes'?: {
      steps?: Array<{
        id?: string
        run?: string
        with?: { command?: string; filters?: string }
      }>
    }
  }
}

type PathFilters = Record<string, string[]>

const workflowPaths = readdirSync('.github/workflows').reduce<string[]>((paths, path) => {
  if (/\.ya?ml$/.test(path)) paths.push(join('.github/workflows', path))
  return paths
}, [])

const filters = load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as PathFilters

function loadWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

function filterMatches(globs: string[], path: string): boolean {
  return globs.some(glob => picomatch.isMatch(path, glob))
}

function expectFilterMatches(filterName: string, paths: string[]): void {
  const globs = filters[filterName]
  expect(globs).toBeDefined()

  const misses = paths.filter(path => !filterMatches(globs!, path))
  assertNoWorkflowViolations(misses, `${filterName} filter misses:`)
}

function ciShellScriptsReferencedByWorkflow(path: string): string[] {
  const workflow = loadWorkflow(path)
  const scripts = new Set<string>()

  for (const job of Object.values(workflow.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      for (const text of [step.run, step.with?.command]) {
        if (!text) continue
        for (const match of text.matchAll(/\b(?:\.\/)?(ci\/[A-Za-z0-9_.-]+\.sh)\b/g)) {
          scripts.add(match[1]!)
        }
      }
    }
  }

  return [...scripts].toSorted()
}

function triggerPaths(workflow: Workflow, triggerName: 'pull_request' | 'push'): string[] {
  const triggers = workflow.on
  if (!triggers || typeof triggers !== 'object' || !(triggerName in triggers)) return []

  const trigger = (triggers as Record<string, unknown>)[triggerName]
  if (!trigger || typeof trigger !== 'object' || !('paths' in trigger)) return []

  const paths = (trigger as { paths?: unknown }).paths
  return Array.isArray(paths) && paths.every(path => typeof path === 'string') ? paths : []
}

describe('workflow script ownership', () => {
  it('keeps workflow-referenced CI shell scripts owned by CI path filters', () => {
    const referencedScripts = workflowPaths.flatMap(ciShellScriptsReferencedByWorkflow)
    const uniqueReferencedScripts = [...new Set(referencedScripts)].toSorted()

    expect(uniqueReferencedScripts.length).toBeGreaterThan(0)
    expectFilterMatches('tooling', uniqueReferencedScripts)
    expectFilterMatches('shell-scripts', uniqueReferencedScripts)
  })

  it('keeps standalone workflow CI shell scripts in their own trigger path filters', () => {
    const missing: string[] = []

    for (const path of workflowPaths) {
      const workflow = loadWorkflow(path)
      const referencedScripts = ciShellScriptsReferencedByWorkflow(path)
      if (referencedScripts.length === 0) continue

      for (const triggerName of ['pull_request', 'push'] as const) {
        const paths = triggerPaths(workflow, triggerName)
        if (paths.length === 0) continue

        const pathSet = new Set(paths)
        for (const script of referencedScripts) {
          if (!pathSet.has(script)) missing.push(`${path} ${triggerName}.paths missing ${script}`)
        }
      }
    }

    assertNoWorkflowViolations(missing, 'Workflow script trigger gaps:')
  })
})
