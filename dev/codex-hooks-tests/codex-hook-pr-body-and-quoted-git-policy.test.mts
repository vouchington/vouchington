import { describe, expect, it } from 'vitest'
import { findPreToolUseBlock } from '../codex-hooks/policy.mts'

describe('Codex hook PR body and quoted git policy', () => {
  it.each([
    'gh pr create --draft --title "feat: test" --body-file /tmp/pr-body.md',
    'gh pr new --title "feat: test" --fill',
    'gh pr create --fill',
    'gh -R owner/repo pr create --title "feat: test" --body "Closes #2476"',
  ])('blocks raw PR creation and points at pr_create: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain('pr_create')
  })

  it.each([
    'gh pr edit 123 --body "## Summary"',
    'gh pr --repo=owner/repo edit 123 --body "## Summary"',
    'gh pr edit 123 --body-file /tmp/pr-body.md',
    "gh pr edit 123 --body $'## Summary\\n- changed'",
  ])('blocks raw PR body edits and points at pr_update: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain('pr_update')
  })

  it('keeps the stack-base rule for gh pr edit --base', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'gh pr edit 123 --base feature-parent' },
      })?.reason,
    ).toContain('PRs must target main')
  })

  it('allows PR edits that do not touch the body', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'gh pr edit 123 --add-label bug --title "fix: x"' },
      }),
    ).toBeNull()
  })

  it.each([
    "printf 'git pull --rebase' > docs.md",
    "printf 'git rebase --continue' > docs.md",
    'echo "do not use git commit --amend" > docs.md',
    'git commit -m "document git pull --rebase policy"',
    'bash -lc "printf \'git pull --rebase\' > docs.md"',
  ])('allows banned git text inside quoted command arguments: %s', command => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      }),
    ).toBeNull()
  })
})
