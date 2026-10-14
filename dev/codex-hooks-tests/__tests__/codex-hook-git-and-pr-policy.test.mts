import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

describe('Codex hook git and PR policy', () => {
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

  it('allows a fetch and rebase chained in one command', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'git fetch origin && git rebase origin/main' },
      }),
    ).toBeNull()
  })

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
})
