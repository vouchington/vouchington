import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

describe('Codex hook gh api merge policy', () => {
  it.each([
    'gh api -X PUT repos/owner/repo/pulls/123/merge',
    'gh api --method PUT repos/owner/repo/pulls/123/merge',
    'gh api repos/owner/repo/pulls/123/merge -XPUT',
    'gh api repos/owner/repo/pulls/123/merge --method=PUT',
    'gh api repos/owner/repo/pulls/123/merge -X put',
    'gh -R owner/repo api -X PUT repos/owner/repo/pulls/123/merge',
    'rtk gh api -X PUT repos/owner/repo/pulls/123/merge',
    'env GH_TOKEN=token gh api -X PUT repos/owner/repo/pulls/123/merge',
    'gh api -X PUT /repos/owner/repo/pulls/123/merge',
    'gh api -X PUT repos/owner/repo/pulls/123/merge?foo=bar',
  ])('blocks a direct PUT merge via gh api: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
  })

  it.each([
    // Checking merge status is a legitimate read; gh api defaults to GET without -X/--method.
    'gh api repos/owner/repo/pulls/123/merge',
    'gh api repos/owner/repo/pulls/123',
    'gh api repos/owner/repo/pulls/123/merge -X GET',
    'gh api user',
    "gh api graphql -f query='query { viewer { login } }'",
  ])('does not block an unrelated or read-only gh api call: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })

  it.each([
    'gh api repos/owner/repo/merges -f base=main -f head=feature',
    'gh api -X POST repos/owner/repo/merges -f base=main -f head=feature',
    'gh api --method POST repos/owner/repo/merges -f base=main -f head=feature',
    'rtk gh api repos/owner/repo/merges -f base=main -f head=feature',
    'gh api repos/owner/repo/merges?foo=bar',
  ])('blocks a direct branch merge via gh api: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
  })

  it.each([
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
    "gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'",
    "rtk gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
  ])('blocks a merge-arming GraphQL mutation via gh api: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
  })

  it('does not block unrelated gh api subcommands', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'gh api repos/owner/repo/issues/123/comments -f body=hi' },
      }),
    ).toBeNull()
  })
})

// Interactively the hook has no opinion on a gh api merge — only a lone `gh pr merge` or
// `gh stack merge` gets the confirm — so the harness's own approval decides.
describe('Codex hook gh api merge policy — interactive', () => {
  it.each([
    'gh api -X PUT repos/owner/repo/pulls/123/merge',
    'gh api repos/owner/repo/merges -f base=main -f head=feature',
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
  ])('has no opinion outside automation: %s', command => {
    expect(
      findPreToolUseBlock({ tool_input: { command } }, { automationContext: false }),
    ).toBeNull()
  })

  it('still blocks with disposition "block" when automationContext is explicitly true', () => {
    const block = findPreToolUseBlock(
      { tool_input: { command: 'gh api -X PUT repos/owner/repo/pulls/123/merge' } },
      { automationContext: true },
    )
    expect(block?.disposition).toBe('block')
    expect(block?.reason).toContain('never delegated to an agent')
  })

  it('defaults to blocking when automationContext is omitted', () => {
    const block = findPreToolUseBlock({
      tool_input: { command: 'gh api -X PUT repos/owner/repo/pulls/123/merge' },
    })
    expect(block?.disposition).toBe('block')
  })
})
