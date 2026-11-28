import { workflowStepScript } from '../../ci/workflow-step-script.mts'
import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { projectsForVitestGroup } from '../../ci/run-vitest-project-group.mts'
import { backendCredentialedProjectNames } from '../../test-helpers/vitest-config/backend-credentialed-project-info.mts'
const workflow = readFileSync('.github/workflows/tests-backend-unit.yml', 'utf8')
const stepsWorkflow = load(workflow) as {
  jobs?: Record<
    string,
    {
      steps?: Array<{
        env?: Record<string, string>
        if?: string
        name?: string
        run?: string
        uses?: string
        with?: Record<string, string | number | boolean>
      }>
    }
  >
}
const runBackendTestsScript = workflowStepScript(
  stepsWorkflow.jobs?.['backend-tests']?.steps?.find(step => step.name === 'Run backend tests')
    ?.run,
)
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>
}
function jobSection(jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)
  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}
describe('backend uncredentialed Docker test workflow', () => {
  it('gives every credentialed project its own script and keeps it out of the core groups', () => {
    expect(backendCredentialedProjectNames.length).toBeGreaterThan(0)
    for (const project of backendCredentialedProjectNames) {
      expect(projectsForVitestGroup('backend-core')).not.toContain(project)
      expect(projectsForVitestGroup('backend-default')).not.toContain(project)
      expect(packageJson.scripts[`test:${project.replace('backend-', 'backend:')}`]).toBe(
        `node ci/run-vitest-project-group.mts ${project}`,
      )
      expect(workflow).not.toContain(`--project ${project}`)
    }
  })

  it('preserves Vitest failures through the tee pipeline before collecting shard hits', () => {
    const script = runBackendTestsScript ?? ''
    const vitestPipeline = '2>&1 | tee backend-unit-output.log'

    expect(script.startsWith('#!/usr/bin/env bash\nset -o pipefail\n')).toBe(true)
    expect(script).toContain(vitestPipeline)
    expect(script.indexOf(' --collect \\')).toBeGreaterThan(script.indexOf(vitestPipeline))
  })

  it('keeps default backend shards free of external credentials', () => {
    const backendJob = jobSection('backend-tests')

    expect(workflow).not.toContain('id-token: write')
    expect(backendJob).not.toContain('Configure AWS credentials')
    expect(backendJob).not.toContain('OPENAI_API_KEY')
  })

  it('uploads each shard JUnit report for per-file timing even when the shard fails', () => {
    const steps = stepsWorkflow.jobs?.['backend-tests']?.steps ?? []
    const runIndex = steps.findIndex(step => step.name === 'Run backend tests')
    const upload = steps.find(step => step.name?.endsWith('JUnit report'))

    expect(runIndex).toBeGreaterThanOrEqual(0)
    expect(upload?.if).toBe('${{ !cancelled() }}')
    expect(upload?.with?.path).toBe(steps[runIndex]?.env?.['VITEST_JUNIT_OUTPUT_FILE'])
  })

  it('does not restore or save a remote Vite transform cache', () => {
    // A remote Vite cache round-trip once consumed a job's entire timeout budget.
    expect(workflow).not.toMatch(/actions\/cache\/(?:restore|save)|\.cache\/vite\/vitest/u)
  })
})
