import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { requiredNamedStep, type WorkflowJob } from './workflow-test-helpers.mts'

type Workflow = {
  concurrency?: { 'cancel-in-progress'?: string; group?: string }
  jobs?: Record<
    string,
    WorkflowJob & { if?: string; permissions?: Record<string, string>; needs?: string[] }
  >
  permissions?: Record<string, string>
  on?: {
    merge_group?: { branches?: string[]; types?: string[] }
  }
}

const ci = load(readFileSync('.github/workflows/ci.yml', 'utf8')) as Workflow
const detectChanges = load(
  readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8'),
) as Workflow
const gitleaks = load(readFileSync('.github/workflows/gitleaks.yml', 'utf8')) as Workflow
const selectCi = load(readFileSync('.github/workflows/ci-select-vitest.yml', 'utf8')) as Workflow
const testsProcessing = load(
  readFileSync('.github/workflows/ci-tests-processing.yml', 'utf8'),
) as Workflow
const testCoverage = load(
  readFileSync('.github/workflows/ci-test-coverage.yml', 'utf8'),
) as Workflow
const buildBackend = load(readFileSync('.github/workflows/build-backend.yml', 'utf8')) as Workflow
const buildWeb = load(readFileSync('.github/workflows/build-web.yml', 'utf8')) as Workflow

describe('merge-group validation', () => {
  it.each([ci, gitleaks])('subscribes required workflows to main queue checks', workflow => {
    expect(workflow.on?.merge_group).toEqual({
      branches: ['main'],
      types: ['checks_requested'],
    })
  })

  it('cancels obsolete queue commits and runs the fail-open full-suite selector', () => {
    expect(ci.concurrency?.group).toContain('github.event.merge_group.head_ref')
    expect(ci.concurrency?.['cancel-in-progress']).toContain("github.event_name == 'merge_group'")
    expect(selectCi.jobs?.['select-ci']?.if).toContain("github.event_name == 'merge_group'")
  })

  it('uses the exact queue revision pair without granting trusted secret context', () => {
    const docsStep = requiredNamedStep(
      detectChanges.jobs?.['detect-changes'],
      'Check for docs-only changes',
    )
    const trustStep = requiredNamedStep(
      detectChanges.jobs?.['detect-changes'],
      'Check for trusted secret context',
    )
    const scanStep = requiredNamedStep(gitleaks.jobs?.gitleaks, 'Determine Gitleaks scan range')

    expect(docsStep.env).toMatchObject({
      EVENT_NAME: '${{ github.event_name }}',
      MERGE_GROUP_BASE_SHA: '${{ github.event.merge_group.base_sha }}',
      MERGE_GROUP_HEAD_SHA: '${{ github.event.merge_group.head_sha }}',
    })
    expect(docsStep.run).toContain(
      'git diff --name-only "${MERGE_GROUP_BASE_SHA}...${MERGE_GROUP_HEAD_SHA}"',
    )
    expect(trustStep.run).toContain('if [ "$EVENT_NAME" = "merge_group" ]; then')
    expect(scanStep.env).toMatchObject({
      MERGE_GROUP_BASE_SHA: '${{ github.event.merge_group.base_sha }}',
      MERGE_GROUP_HEAD_SHA: '${{ github.event.merge_group.head_sha }}',
    })
    expect(scanStep.run).toContain('LOG_OPTS="${MERGE_GROUP_BASE_SHA}..${MERGE_GROUP_HEAD_SHA}"')
  })

  it('keeps queue report processing and image builds read-only and secret-free', () => {
    const coverage = ci.jobs?.['test-coverage-merge-group']
    const processing = ci.jobs?.['tests-processing-merge-group']
    const backendBuild = ci.jobs?.['build-backend-merge-group']
    const webBuild = ci.jobs?.['build-web-merge-group']

    for (const job of [coverage, processing, backendBuild, webBuild]) {
      expect(job?.if).toContain("github.event_name == 'merge_group'")
      expect(job?.permissions).toEqual({ actions: 'read', contents: 'read' })
      expect(job).not.toHaveProperty('secrets')
    }

    const mergeStep = requiredNamedStep(
      testsProcessing.jobs?.['tests-processing'],
      'Merge Vitest reports',
    )
    expect(mergeStep.if).toContain("github.event_name == 'merge_group'")
    const deleteStep = requiredNamedStep(
      testsProcessing.jobs?.['tests-processing'],
      'Delete inter-job blob artifacts',
    )
    expect(deleteStep.if).toContain("github.event_name == 'pull_request'")
  })

  it('inherits caller permissions in reusable jobs so read-only queue calls validate', () => {
    for (const workflow of [testCoverage, testsProcessing, buildBackend, buildWeb]) {
      expect(workflow.permissions).toBeUndefined()
    }
    expect(testCoverage.jobs?.['test-coverage']?.permissions).toBeUndefined()
    expect(testsProcessing.jobs?.['tests-processing']?.permissions).toBeUndefined()
    for (const jobName of ['test-coverage', 'tests-processing', 'build-backend', 'build-web']) {
      const prJob = ci.jobs?.[jobName]
      expect(prJob?.permissions).toBeDefined()
    }
  })

  it('makes the required gates depend on queue-specific validation jobs', () => {
    expect(ci.jobs?.tests?.needs).toEqual(['tests-processing', 'tests-processing-merge-group'])
    expect(ci.jobs?.build?.needs).toEqual([
      'tests',
      'build-backend',
      'build-backend-merge-group',
      'build-web',
      'build-web-merge-group',
    ])
  })

  it.each([buildBackend, buildWeb])(
    'runs image validation with inert credentials when the caller is untrusted',
    workflow => {
      const build = workflow.jobs?.build
      expect(build?.if).toBeUndefined()
      const inertCredentials = requiredNamedStep(build, 'Configure inert AWS credentials')
      expect(inertCredentials.if).toBe('${{ !inputs.trusted_secret_context }}')
      expect(inertCredentials.run).toContain('AWS_ACCESS_KEY_ID=merge-group-validation')
      const configureAws = build?.steps?.find(step => step.uses === './.github/actions/setup-aws')
      expect(configureAws?.if).toBe('${{ inputs.trusted_secret_context }}')
    },
  )
})
