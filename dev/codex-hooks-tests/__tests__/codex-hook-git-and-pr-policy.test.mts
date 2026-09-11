import { rm } from 'node:fs/promises'

import { afterEach, describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

const testDirs: string[] = []

describe('Codex hook git and PR policy', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it.each([
    ['git push --force origin docs/codex-workflow', 'Force pushes'],
    ['git push -f origin docs/codex-workflow', 'Force pushes'],
    ['git push origin +HEAD:main', 'Force pushes'],
    ['git commit --amend --no-edit', 'Commit amend'],
    ['git pull --rebase', 'git pull --rebase'],
    ['git pull -r origin main', 'git pull --rebase'],
    ['git rebase --continue', 'GIT_EDITOR=true git rebase --continue'],
    ['bash -lc "git rebase --continue"', 'GIT_EDITOR=true git rebase --continue'],
    ['GIT_EDITOR=true echo ok && git rebase --continue', 'GIT_EDITOR=true git rebase --continue'],
    [
      'GIT_EDITOR=true git status && git rebase --continue',
      'GIT_EDITOR=true git rebase --continue',
    ],
    [
      'bash -lc "git rebase --continue; export GIT_EDITOR=true"',
      'GIT_EDITOR=true git rebase --continue',
    ],
    [
      'bash -lc "export GIT_EDITOR=true; unset GIT_EDITOR; git rebase --continue"',
      'GIT_EDITOR=true git rebase --continue',
    ],
    ['(export GIT_EDITOR=true); git rebase --continue', 'GIT_EDITOR=true git rebase --continue'],
    ['git rebase -X ours origin/main', 'strategy options'],
    ['git merge --strategy-option=theirs main', 'strategy options'],
    ['git checkout --ours package.json', 'checkout --ours'],
    ['git checkout package.json --theirs', 'checkout --ours'],
    ['bash -lc "git push --force origin docs/codex-workflow"', 'Force pushes'],
    ["zsh -c 'git commit --amend --no-edit'", 'Commit amend'],
    ['git push --no-verify', '--no-verify'],
    ['git commit --no-verify -m "x"', '--no-verify'],
    ['git rebase --no-verify', '--no-verify'],
    ['bash -lc "git push --no-verify"', '--no-verify'],
    ['git commit -n -m "x"', '-n bypasses'],
    ['git commit -an -m "x"', '-n bypasses'],
    ['git commit -nm "x"', '-n bypasses'],
    ['git -c core.hooksPath=/dev/null push', 'core.hooksPath'],
    ['git -c core.hooksPath= commit -m "x"', 'core.hooksPath'],
    ['HUSKY=0 git commit -m "x"', 'HUSKY=0'],
    ['bash -lc "HUSKY=0 git push"', 'HUSKY=0'],
  ])('blocks banned git command: %s', (command, reasonText) => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      })?.reason,
    ).toContain(reasonText)
  })

  it('allows the sanctioned fetch and rebase workflow', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'git fetch origin && git rebase origin/main' },
      }),
    ).toBeNull()
  })

  it.each([
    'gh pr create --fill',
    'gh pr create --title \"feat: test\" --body \"## Related issues\\nCloses #2476\"',
    'env GH_TOKEN=token gh pr create --title \"feat: test\" --body \"## Related issues\\nCloses #2476\"',
    'command gh pr create --title \"feat: test\" --body \"## Related issues\\nCloses #2476\"',
  ])('blocks PR creation without --draft: %s', command => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      })?.reason,
    ).toContain('New PRs must be opened as draft first')
  })

  it.each(['gh pr create --draft --fill'])(
    'allows PR creation with --draft when other policy requirements pass: %s',
    command => {
      expect(
        findPreToolUseBlock({
          tool_input: { command },
        }),
      ).toBeNull()
    },
  )

  it.each([
    'GIT_EDITOR=true git rebase --continue',
    'GIT_EDITOR="true" git rebase --continue',
    "GIT_EDITOR='true' git rebase --continue",
    'env GIT_EDITOR=true git rebase --continue',
    'bash -lc "GIT_EDITOR=true git rebase --continue"',
    'bash -lc "GIT_EDITOR=\\"true\\" git rebase --continue"',
    'bash -lc "export GIT_EDITOR=true; git rebase --continue"',
    'bash -lc "export GIT_EDITOR=\\"true\\"; git rebase --continue"',
    'env GIT_EDITOR=true bash -lc "git rebase --continue"',
    'FOO=1 GIT_EDITOR=true bash -lc "git rebase --continue"',
    'env FOO=1 GIT_EDITOR=true bash -lc "git rebase --continue"',
    'export GIT_EDITOR=true; bash -lc "git rebase --continue"',
    'export GIT_EDITOR=true; echo ok; git rebase --continue',
    'GIT_EDITOR=true bash -lc "git rebase --continue"',
  ])('allows noninteractive rebase continuation: %s', command => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      }),
    ).toBeNull()
  })

  it.each([
    'git push --force-with-lease',
    'git push --force-with-lease origin docs/codex-workflow',
    'git push --force-with-lease=origin/docs/codex-workflow origin docs/codex-workflow',
    'git push --no-force',
    'bash -lc "git push --force-with-lease origin docs/codex-workflow"',
  ])('allows the sanctioned rebase push workflow: %s', command => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      }),
    ).toBeNull()
  })

  it.each(['git commit -m "no-verify in message"', 'git commit -am "message"', 'HUSKY=1 git push'])(
    'allows legitimate command that resembles a hook bypass: %s',
    command => {
      expect(
        findPreToolUseBlock({
          tool_input: { command },
        }),
      ).toBeNull()
    },
  )

  it('blocks PR creation without closing issue references', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh pr create --draft --title "feat: test" --body "## Summary\\n- changed"',
        },
      })?.reason,
    ).toContain('Closes #123')
  })

  it.each([
    'GH_TOKEN=token gh pr create --draft --title "feat: test" --body "## Summary"',
    'env GH_TOKEN=token gh pr create --draft --title "feat: test" --body "## Summary"',
    'env -u GH_HOST GH_TOKEN=token gh pr create --draft --title "feat: test" --body "## Summary"',
    'command gh pr create --draft --title "feat: test" --body "## Summary"',
    'GH_TOKEN=token command gh pr create --draft --title "feat: test" --body "## Summary"',
  ])('blocks PR creation without closing references through wrapper form: %s', command => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      })?.reason,
    ).toContain('Closes #123')
  })

  it('allows PR creation with closing issue references', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command:
            'gh pr create --draft --title "feat: test" --body "## Related issues\nCloses #2476"',
        },
      }),
    ).toBeNull()
  })

  it('allows scheduled prompt PR creation with the exact no-source representation', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command:
            "gh pr create --draft --title 'Automation scheduled: test' --body $'## Related issues\\n\\nNo source issue; scheduled prompt run.\\n<!-- related-issues-validation: no-source-scheduled-prompt -->\\n\\nWorkspace setup: Auto Harness scheduled prompt'",
        },
      }),
    ).toBeNull()
  })

  it('allows scheduled prompt PR body replacement with the exact no-source representation', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command:
            "gh pr edit 123 --body $'## Related issues\\n\\nNo source issue; scheduled prompt run.\\n<!-- related-issues-validation: no-source-scheduled-prompt -->\\n\\nWorkspace setup: Auto Harness scheduled prompt'",
        },
      }),
    ).toBeNull()
  })

  it('blocks scheduled no-source strings that appear only inside fenced examples', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command:
            "gh pr create --draft --title 'feat: example' --body $'## Related issues\\n\\n~~~md\\nNo source issue; scheduled prompt run.\\n<!-- related-issues-validation: no-source-scheduled-prompt -->\\n~~~\\n\\n~~~text\\nWorkspace setup: Auto Harness scheduled prompt\\n~~~'",
        },
      })?.reason,
    ).toContain('Closes #123')
  })

  it.each([
    'gh pr create --draft --title "feat: test" --body $\'## Related issues\\nCloses #2476\'',
    'gh pr create --draft --title "feat: test" --body=$\'## Related issues\\nCloses #2476\'',
    "gh pr edit 123 --body $'## Related issues\\nCloses #2476'",
    'zsh -lc "gh pr edit 123 --body $\'## Related issues\\nCloses #2476\'"',
  ])('allows PR body closing references in ANSI-C quoted shell strings: %s', command => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      }),
    ).toBeNull()
  })

  it('does not treat backslash-escaped issue references as PR closing keywords', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh pr create --draft --title "feat: test" --body "Closes \\#2476"',
        },
      })?.reason,
    ).toContain('Closes #123')
  })

  it('does not treat backslash-escaped issue references in ANSI-C quoted strings as PR closing keywords', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'gh pr create --draft --title "feat: test" --body $\'Closes \\\\#2476\'',
        },
      })?.reason,
    ).toContain('Closes #123')
  })

  it('blocks PR creation without closing references inside grouped commands', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: '(gh pr create --draft --title "feat: test" --body "## Summary")',
        },
      })?.reason,
    ).toContain('Closes #123')
  })

  it.each([
    'if gh pr create --draft --title "feat: test" --body "## Summary"; then echo ok; fi',
    'if false; then echo no; elif gh pr create --draft --title "feat: test" --body "## Summary"; then echo ok; fi',
    'while gh pr create --draft --title "feat: test" --body "## Summary"; do echo ok; done',
    'until gh pr create --draft --title "feat: test" --body "## Summary"; do echo ok; done',
    'if ! gh pr create --draft --title "feat: test" --body "## Summary"; then echo ok; fi',
    'time gh pr create --draft --title "feat: test" --body "## Summary"',
  ])('blocks PR creation without closing references after shell control prefix: %s', command => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      })?.reason,
    ).toContain('Closes #123')
  })

  it('ignores gh workflow text that is not in command position', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: 'echo gh pr create --draft --body "## Summary"',
        },
      }),
    ).toBeNull()
  })

  it('stops PR option parsing at background and newline command separators', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command:
            'gh pr create --draft --title "feat: test" --fill & echo --body "## Summary"\ngh pr create --draft --title "feat: test" --fill',
        },
      }),
    ).toBeNull()
  })
})
