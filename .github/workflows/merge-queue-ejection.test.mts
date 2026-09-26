import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { workflowHasTrigger } from '../test-helpers/workflow-test-helpers.mts'

type Step = { uses?: string; run?: string; with?: Record<string, unknown> }
type Job = {
  if?: string
  env?: Record<string, string>
  permissions?: Record<string, string>
  steps?: Step[]
  uses?: string
  with?: Record<string, string>
}
type Workflow = { on?: unknown; permissions?: Record<string, string>; jobs: Record<string, Job> }

const path = '.github/workflows/merge-queue-ejection.yml'
const text = readFileSync(path, 'utf8')
const workflow = parse(text) as Workflow
const jobs = Object.entries(workflow.jobs)
const prompt = readFileSync('docs/prompts/automation/merge-queue-ejection.md', 'utf8').replace(
  /\s+/gu,
  ' ',
)

describe('merge-queue ejection workflow', () => {
  it('runs only when the merge queue dequeues a main pull request', () => {
    expect(workflow.on).toEqual({
      pull_request_target: { types: ['dequeued'], branches: ['main'] },
    })
  })

  it('is the only pull_request_target workflow', () => {
    const privileged = readdirSync('.github/workflows')
      .filter(file => /\.ya?ml$/u.test(file))
      .filter(file => {
        const parsed = parse(readFileSync(join('.github/workflows', file), 'utf8')) as Workflow
        return workflowHasTrigger(parsed.on, 'pull_request_target')
      })
    expect(privileged).toEqual(['merge-queue-ejection.yml'])
  })

  it('gates dispatch on both harness variables and a CI ejection reason', () => {
    const condition = workflow.jobs['render-prompt']?.if ?? ''
    expect(condition).toContain("vars.HARNESS_DISPATCH_ENABLED == 'true'")
    expect(condition).toContain("vars.HARNESS_MERGE_QUEUE_EJECTION_ENABLED == 'true'")
    expect(condition).toContain(
      `contains(fromJSON('["CI_FAILURE","CI_TIMEOUT"]'), github.event.reason)`,
    )
  })

  it('never checks out, installs, or executes pull-request content', () => {
    const checkouts = jobs.flatMap(([, job]) =>
      (job.steps ?? []).filter(step => step.uses?.startsWith('actions/checkout@')),
    )
    expect(checkouts).not.toHaveLength(0)
    for (const step of checkouts) {
      expect(step.with).toEqual({ ref: '${{ github.sha }}', 'persist-credentials': false })
    }
    expect(text).not.toMatch(/github\.event\.pull_request\.head\.(?:ref|repo)/u)
    expect(text).not.toMatch(/github\.head_ref|refs\/pull\//u)
  })

  it('keeps pull-request fields out of shell scripts', () => {
    for (const [, job] of jobs) {
      for (const step of job.steps ?? []) {
        expect(step.run ?? '').not.toContain('${{')
      }
    }
  })

  it('grants write access only to the failure comment', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' })
    for (const [name, job] of jobs) {
      const expected = name === 'escalate' ? { 'pull-requests': 'write' } : { contents: 'read' }
      expect(job.permissions).toEqual(expected)
    }
  })

  it('dispatches a triage session that checks out main, not the ejected head', () => {
    const dispatch = workflow.jobs.dispatch
    expect(dispatch?.uses).toBe('./.github/workflows/harness-dispatch.yml')
    expect(dispatch?.with).toMatchObject({
      'agent-ref': '${{ github.sha }}',
      'expected-head-sha': '${{ github.sha }}',
      'publish-base-ref': 'main',
      'surface-gate': 'HARNESS_MERGE_QUEUE_EJECTION_ENABLED',
    })
    expect(dispatch?.with?.['concurrency-id']).toBe(
      'vouchington:mq-eject:${{ github.event.pull_request.number }}:${{ github.event.pull_request.head.sha }}',
    )
  })

  it('passes the automation:auto-fix label the prompt tells the session to apply', () => {
    expect(workflow.jobs.dispatch?.with?.['pr-label']).toBe('automation:auto-fix')
    expect(prompt).toContain('`automation`')
    expect(prompt).toContain('`automation:auto-fix`')
  })

  it('comments on the pull request when triage cannot start', () => {
    const condition = workflow.jobs.escalate?.if ?? ''
    for (const job of ['render-prompt', 'dispatch']) {
      expect(condition).toContain(`needs.${job}.result == 'failure'`)
      expect(condition).toContain(`needs.${job}.result == 'cancelled'`)
    }
  })

  it('limits the session to triage outcomes that never change the ejected pull request', () => {
    expect(prompt).toContain('Never change the ejected pull request.')
    expect(prompt).toContain('The pull request is the root cause.')
    expect(prompt).toContain('Post the analysis comment below and stop. Do not fix it.')
    expect(prompt).toContain('create one draft fix PR from `main`')
    expect(prompt).toContain('Create the fix branch from `{{MAIN_SHA}}`')
    expect(prompt).toContain('require `git log {{MAIN_SHA}}..HEAD` to list only your own commits')
    expect(prompt).toContain('Do not open a PR for it.')
    expect(prompt).toContain('Never push to the pull request')
    expect(prompt).toContain('Post at most one comment on PR #{{PR_NUMBER}}')
    expect(prompt).toContain(
      '<!-- merge-queue-ejection-triage pr={{PR_NUMBER}} head={{PR_HEAD_SHA}} main={{MAIN_SHA}} -->',
    )
  })
})
