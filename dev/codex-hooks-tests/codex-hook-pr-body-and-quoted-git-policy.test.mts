import { describe, expect, it } from 'vitest'
import { findPreToolUseBlock } from '../codex-hooks/policy.mts'

describe('Codex hook raw PR operations and quoted git policy', () => {
  it.each([
    'gh pr create --repo widgets-inc/tool --title "feat: test" --body "Closes #2476"',
    'gh pr create --repo widgets-inc/tool --base develop --title "feat: test" --body "Closes #2476"',
    'gh -R widgets-inc/tool pr create --title "feat: test" --body-file /tmp/pr-body.md',
    'gh pr new --repo widgets-inc/tool --title "feat: test" --fill',
    'gh pr create --base feature-parent --title "feat: test" --body "Closes #2476"',
    'gh pr new --base feature-parent --fill',
  ])('does not intercept raw PR creation: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })

  it.each([
    'gh pr edit 123 --repo widgets-inc/tool --body "## Summary"',
    'gh pr edit 123 --repo widgets-inc/tool --base develop',
    'gh pr edit 123 --repo=widgets-inc/tool --body-file /tmp/pr-body.md',
    "gh pr edit https://github.com/widgets-inc/tool/pull/123 --body $'## Summary\\n- changed'",
  ])('does not intercept raw PR body edits for a sibling repository: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
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
