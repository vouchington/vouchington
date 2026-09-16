import { readFileSync } from 'node:fs'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const path = '.github/workflows/opencode-zen-code-review.yml'
const source = readFileSync(path, 'utf8')
const workflow = parse(source) as {
  permissions: Record<string, string>
  concurrency: { group: string; 'cancel-in-progress': boolean }
  jobs: Record<
    string,
    {
      if?: string
      uses?: string
      permissions?: Record<string, string>
      with?: Record<string, string>
      secrets?: Record<string, string>
      concurrency?: { group: string; queue?: string; 'cancel-in-progress': boolean }
    }
  >
}

describe('OpenCode Zen code review integration', () => {
  it('calls the frozen vouchington-tooling reusable workflow at a real commit SHA', () => {
    const callerPattern =
      /^vouchington\/vouchington-tooling\/\.github\/workflows\/opencode-code-review\.yml@[a-f0-9]{40}$/u

    expect(workflow.jobs['opencode-zen-review'].uses).toMatch(callerPattern)
  })

  it('scopes the job to non-draft, same-repo, non-bot pull requests, excluding the closed action', () => {
    const job = workflow.jobs['opencode-zen-review']
    expect(job.if).toContain("github.event.action != 'closed'")
    expect(job.if).toContain('github.event.pull_request.draft == false')
    expect(job.if).toContain('github.event.pull_request.head.repo.full_name == github.repository')
    expect(job.if).toContain("!endsWith(github.event.pull_request.user.login, '[bot]')")
    expect(job.if).toContain("vars.OPENCODE_ZEN_CODE_REVIEW_ENABLED == 'true'")
  })

  it('includes closed and converted_to_draft in the trigger types so either coalesces a queued review', () => {
    const on = (workflow as unknown as { on: { pull_request: { types: string[] } } }).on
    expect(on.pull_request.types).toContain('closed')
    expect(on.pull_request.types).toContain('converted_to_draft')
  })

  it('grants actions:read, checks:write, contents:read, issues:read, and pull-requests:write, with a repo-level read-only default', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs['opencode-zen-review'].permissions).toEqual({
      actions: 'read',
      checks: 'write',
      contents: 'read',
      issues: 'read',
      'pull-requests': 'write',
    })
  })

  it('passes the expected provider, model, and runner inputs, with a 10-minute timeout', () => {
    const withInputs = workflow.jobs['opencode-zen-review'].with ?? {}
    expect(withInputs).toEqual({
      provider: 'opencode-zen',
      model: 'opencode/muse-spark-1.3-contributor-free',
      pr_number: '${{ github.event.pull_request.number }}',
      runs_on: '["ubuntu-latest"]',
      timeout_minutes: '10',
    })
  })

  it('does not duplicate the uses: SHA as a tooling_ref input, since the callee derives it from job.workflow_sha', () => {
    const job = workflow.jobs['opencode-zen-review']
    expect(job.with).not.toHaveProperty('tooling_ref')
  })

  it('forwards the OpenCode Zen secret under code_review_api_key', () => {
    expect(workflow.jobs['opencode-zen-review'].secrets).toEqual({
      code_review_api_key: '${{ secrets.OPENCODE_FREE_API_KEY }}',
    })
  })

  it('coalesces a superseded run per pull request without cancelling an in-progress one', () => {
    expect(workflow.concurrency.group).toBe(
      'opencode-zen-code-review-${{ github.event.pull_request.number }}',
    )
    expect(workflow.concurrency['cancel-in-progress']).toBe(false)
  })

  it('uses a concurrency group distinct from the sibling OpenCode/OpenRouter caller so a stall in one never holds the other', () => {
    expect(workflow.concurrency.group).not.toBe(
      'opencode-openrouter-code-review-${{ github.event.pull_request.number }}',
    )
  })

  it('caps the job to 1 concurrent execution repo-wide via a fixed FIFO fleet-admission group', () => {
    expect(workflow.jobs['opencode-zen-review'].concurrency).toEqual({
      group: 'opencode-zen-review-fleet-admission',
      queue: 'max',
      'cancel-in-progress': false,
    })
  })
})
