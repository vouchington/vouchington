import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { CI_ROOT_JOB_NAMES, TOPOLOGY_ROOT_JOB_NAMES } from '../../ci/workflow-topology-impact.mts'

type Job = {
  if?: string
  needs?: string[]
  outputs?: Record<string, string>
  steps?: Array<{ id?: string; with?: { filters?: string } }>
}
type Workflow = { jobs?: Record<string, Job> }

const workflow = load(readFileSync('.github/workflows/ci.yml', 'utf8')) as Workflow
const selectorWorkflow = load(
  readFileSync('.github/workflows/ci-select-vitest.yml', 'utf8'),
) as Workflow
const selector = selectorWorkflow.jobs?.['select-ci']
const gatedRoots = TOPOLOGY_ROOT_JOB_NAMES.filter(job => job !== 'static-code-analysis')
const filters = load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as Record<
  string,
  string[]
>
const workflowActionFallback = 'needs.detect-changes.outputs.workflow-action-changes'

describe('CI topology-selection wiring', () => {
  it('keeps the full-root validation allowlist synchronized with ci.yml', () => {
    expect([...CI_ROOT_JOB_NAMES].toSorted()).toEqual(Object.keys(workflow.jobs ?? {}).toSorted())
  })
  it('publishes fixed fail-open topology outputs from select-ci', () => {
    expect(selector?.outputs?.['full-ci']).toBe('${{ steps.select.outputs.full-ci }}')
    for (const job of TOPOLOGY_ROOT_JOB_NAMES) {
      expect(selector?.outputs?.[`run-${job}`]).toBe(`\${{ steps.select.outputs.run-${job} }}`)
    }
  })

  it('exposes sharded web API and integration selection controls', () => {
    for (const job of ['test-web-api', 'test-web-integration']) {
      for (const output of ['shard-total', 'files', 'full', 'run-tests', 'skip']) {
        expect(selectorWorkflow.jobs?.['select-ci']?.outputs?.[`${output}-${job}`]).toBe(
          `\${{ steps.select.outputs.${output}-${job} }}`,
        )
      }
    }
  })

  it('gates every topology-selectable producer with a PR-scoped fail-open term', () => {
    for (const root of gatedRoots) {
      const job = workflow.jobs?.[root]
      expect(job?.needs).toContain('select-ci')
      expect(job?.if).toContain("github.event_name == 'pull_request'")
      expect(job?.if).toContain("needs.detect-changes.outputs.docs-only != 'true'")
      expect(job?.if).toContain("needs.select-ci.outputs.full-ci != 'false'")
      expect(job?.if).toContain(`needs.select-ci.outputs.run-${root} == 'true'`)
      expect(job?.if).toContain('needs.detect-changes.outputs.workflow-action-changes')
    }
  })

  it('keeps workflow/action globs out of PR producer filters', () => {
    const fixtureAllowlist = new Set(['tooling', 'workflow-action-changes'])
    for (const [name, globs] of Object.entries(filters)) {
      if (fixtureAllowlist.has(name)) continue
      expect(
        globs.filter(
          glob => glob.startsWith('.github/workflows/') || glob.startsWith('.github/actions/'),
        ),
      ).toEqual([])
    }
    expect(filters['workflow-action-changes']).toEqual([
      '.github/workflows/**',
      '.github/actions/**',
    ])
  })

  it('uses the workflow/action fallback only outside pull requests', () => {
    for (const root of gatedRoots) {
      const expression = workflow.jobs?.[root]?.if ?? ''
      expect(expression).toMatch(/github\.event_name (== 'workflow_dispatch'|!= 'pull_request')/)
    }
  })

  it('activates each static area from its own bounded topology output', () => {
    for (const area of ['backend', 'web', 'lambdas', 'cloudflare-worker']) {
      const job = workflow.jobs?.[`static-${area}`] as unknown as {
        if?: string
        with?: Record<string, string | boolean>
      }
      expect(job?.if).toContain(`needs.select-ci.outputs.run-static-${area}`)
      expect(job?.if).toContain(workflowActionFallback)
      expect(job?.with?.[area]).toBe(true)
    }
  })

  it('carries the manual workflow/action fallback through nested gates', () => {
    expect(
      workflow.jobs?.['test-backend-credentialed']?.if?.match(/workflow-action-changes/gu),
    ).toHaveLength(2)
  })

  it('preserves stable aggregate fan-ins outside topology producer routing', () => {
    for (const job of ['tests', 'build']) {
      expect(workflow.jobs?.[job]?.needs).not.toContain('select-ci')
    }
  })

  it('declares the web API prerequisite before consuming its result', () => {
    for (const jobName of [
      'test-playwright',
      'test-playwright-credentialed',
      'test-coverage',
      'tests-processing',
    ]) {
      expect(workflow.jobs?.[jobName]?.needs).toContain('test-web-api')
    }
  })
})
