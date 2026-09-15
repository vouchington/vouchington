import { readFileSync } from 'node:fs'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const path = '.github/workflows/claude-openrouter-code-reviewer.yml'
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

describe('Claude OpenRouter code review integration', () => {
  it('calls the frozen vouchington-tooling reusable code-review workflow at a real commit SHA', () => {
    const callerPattern =
      /^vouchington\/vouchington-tooling\/\.github\/workflows\/code-review\.yml@[a-f0-9]{40}$/u

    expect(workflow.jobs['claude-openrouter-code-reviewer'].uses).toMatch(callerPattern)
  })

  it('scopes the job to non-draft, same-repo, non-bot pull requests, excluding the closed action', () => {
    const job = workflow.jobs['claude-openrouter-code-reviewer']
    expect(job.if).toContain("github.event.action != 'closed'")
    expect(job.if).toContain('github.event.pull_request.draft == false')
    expect(job.if).toContain('github.event.pull_request.head.repo.full_name == github.repository')
    expect(job.if).toContain("!endsWith(github.event.pull_request.user.login, '[bot]')")
    expect(job.if).toContain("vars.CLAUDE_OPENROUTER_CODE_REVIEW_ENABLED == 'true'")
  })

  it('includes closed and converted_to_draft in the trigger types so either coalesces a queued review', () => {
    const on = (workflow as unknown as { on: { pull_request: { types: string[] } } }).on
    expect(on.pull_request.types).toEqual(
      expect.arrayContaining([
        'opened',
        'reopened',
        'ready_for_review',
        'synchronize',
        'closed',
        'converted_to_draft',
      ]),
    )
    expect(on.pull_request.types).toContain('closed')
    expect(on.pull_request.types).toContain('converted_to_draft')
  })

  it('grants actions:read, checks:write, contents:read, issues:read, pull-requests:write, and id-token:write, with a repo-level read-only default', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs['claude-openrouter-code-reviewer'].permissions).toEqual({
      actions: 'read',
      checks: 'write',
      contents: 'read',
      issues: 'read',
      'pull-requests': 'write',
      'id-token': 'write',
    })
  })

  it('passes the selected-SHA, trusted-prompt, provider, and runner inputs', () => {
    const withInputs = workflow.jobs['claude-openrouter-code-reviewer'].with ?? {}
    expect(withInputs).toEqual({
      pr_number: '${{ github.event.pull_request.number }}',
      expected_head_sha: '${{ github.event.pull_request.head.sha }}',
      expected_base_sha: '${{ github.event.pull_request.base.sha }}',
      trusted_prompt_ref: '${{ github.event.pull_request.base.sha }}',
      provider_name: 'Claude (OpenRouter)',
      token_source: 'github-token',
      anthropic_base_url: 'https://openrouter.ai/api',
      anthropic_default_opus_model: 'thinkingmachines/inkling:free',
      anthropic_default_sonnet_model: 'thinkingmachines/inkling:free',
      anthropic_default_haiku_model: 'thinkingmachines/inkling:free',
      runs_on: '["self-hosted","Linux","X64","Docker","Code Review"]',
    })
  })

  it('does not duplicate the uses: SHA as a tooling_ref input, since the callee derives it from job.workflow_sha', () => {
    const job = workflow.jobs['claude-openrouter-code-reviewer']
    expect(job.with).not.toHaveProperty('tooling_ref')
  })

  it('forwards the OpenRouter secret under provider_api_token, with no Claude App token', () => {
    expect(workflow.jobs['claude-openrouter-code-reviewer'].secrets).toEqual({
      provider_api_token: '${{ secrets.OPENROUTER_FREE_API_KEY }}',
    })
  })

  it('coalesces a superseded run per pull request without cancelling an in-progress one', () => {
    expect(workflow.concurrency.group).toBe(
      'claude-openrouter-code-reviewer-${{ github.event.pull_request.number }}',
    )
    expect(workflow.concurrency['cancel-in-progress']).toBe(false)
  })

  it('uses a concurrency group distinct from the OpenCode caller so providers never collide', () => {
    expect(workflow.concurrency.group).not.toBe(
      'opencode-code-review-${{ github.event.pull_request.number }}',
    )
  })

  it('caps the job to 1 concurrent execution repo-wide via a fixed FIFO fleet-admission group', () => {
    const jobConcurrency = workflow.jobs['claude-openrouter-code-reviewer'].concurrency
    expect(jobConcurrency).toEqual({
      group: 'claude-openrouter-code-reviewer-fleet-admission',
      queue: 'max',
      'cancel-in-progress': false,
    })
  })

  it('collapses all three model tiers to the same $0 model deliberately, not by accident', () => {
    const withInputs = workflow.jobs['claude-openrouter-code-reviewer'].with ?? {}
    const tiers = [
      withInputs.anthropic_default_opus_model,
      withInputs.anthropic_default_sonnet_model,
      withInputs.anthropic_default_haiku_model,
    ]
    expect(new Set(tiers).size).toBe(1)
    expect(tiers[0]).toBe('thinkingmachines/inkling:free')
  })
})
